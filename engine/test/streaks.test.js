#!/usr/bin/env node
/* The killstreak rail, the Berserker Suit, and the three stances.
 *
 * All three are things you can only really check by putting them on a
 * screen and looking: a rail whose icons are grey when they should be
 * yellow is a rail that passes every field check. So this drives the
 * real thing -- the real rail, the real suit, the real match -- and
 * asks the DOM and the scene what they actually contain.
 *
 * THE CLOCK IS NOT WALL TIME. This renderer manages about two frames a
 * second, and the suit's sequence is twenty seconds of match time, so
 * anything timed in milliseconds here is timed in nothing. States are
 * reached through the module's own _skipTo and everything else waits
 * for a condition.
 *
 * Usage: node engine/test/streaks.test.js
 */
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
function note(s) { console.log(`..   ${s}`); }

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));

  await page.goto('file://' + path.join(ROOT, 'site/games/multiplayer.html')
    + '?map=helipad&mode=tdm');
  await page.waitForFunction(() => window.MP && window.MP.match, null, { timeout: 180000 });
  await page.waitForTimeout(900);

  /* ---------------- no click to play ---------------- */
  const gate = await page.evaluate(() => {
    const lock = document.querySelector('#mpui .lock');
    const cs = lock ? getComputedStyle(lock) : null;
    const r = lock ? lock.getBoundingClientRect() : null;
    return {
      exists: !!lock,
      /* The hint must not be able to eat a click, and must not cover
         the screen -- both of which the plate it replaced did. */
      clickable: cs ? cs.pointerEvents !== 'none' : null,
      tall: r ? r.height / window.innerHeight : 1,
      running: !!(window.MP.match && window.MP.match.time > 0),
      moving: window.MP.match.people.some((p) => p.bot && p.alive),
    };
  });
  check('the match is already running: no plate to click through', gate.running === true);
  check('the mouse-look hint cannot eat a click', gate.clickable === false);
  check('and it is a line of text, not a full-screen gate', gate.tall < 0.2,
    `${(gate.tall * 100).toFixed(0)}% of the screen`);

  /* ---------------- the rail ---------------- */
  const rail0 = await page.evaluate(() => {
    const cells = [].slice.call(document.querySelectorAll('#mpui .rail .ks'));
    const rail = document.querySelector('#mpui .rail');
    const r = rail ? rail.getBoundingClientRect() : null;
    return {
      n: cells.length,
      svgs: cells.filter((c) => !!c.querySelector('svg')).length,
      distinct: new Set(cells.map((c) => c.querySelector('svg').innerHTML)).size,
      lit: cells.filter((c) => c.classList.contains('on')).length,
      /* Left edge, vertically centred, which is where it was asked
         for. */
      left: r ? r.left : -1,
      midY: r ? Math.abs((r.top + r.height / 2) - window.innerHeight / 2) : 999,
      streak: window.MP.match.you.streak,
    };
  });
  check('three killstreaks on the rail', rail0.n === 3, String(rail0.n));
  check('each one is a drawn icon', rail0.svgs === 3);
  check('and they are three different drawings', rail0.distinct === 3,
    `${rail0.distinct} distinct`);
  check('it is on the left edge of the screen', rail0.left <= 2, `${rail0.left}px`);
  check('and vertically centred', rail0.midY < 4, `${rail0.midY.toFixed(0)}px off`);
  check('nothing is lit before any kills', rail0.lit === 0, `${rail0.lit} lit`);

  const rail1 = await page.evaluate(async () => {
    window.MP.match.you.streak = 40;
    for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r));
    const cells = [].slice.call(document.querySelectorAll('#mpui .rail .ks'));
    const on = cells.filter((c) => c.classList.contains('on'));
    const col = on.length ? getComputedStyle(on[0]).color : '';
    const off = cells.length ? getComputedStyle(cells[0]).color : '';
    return { lit: on.length, col, off };
  });
  check('earning the kills lights all three', rail1.lit === 3, String(rail1.lit));
  note(`unlocked colour ${rail1.col}`);

  /* Grey to yellow, checked as a colour rather than as a class name. */
  const yellow = /rgb\((\d+), (\d+), (\d+)\)/.exec(rail1.col);
  check('and they turn yellow, not merely change class',
    !!yellow && +yellow[1] > 180 && +yellow[2] > 140 && +yellow[3] < 160, rail1.col);

  /* ---------------- the red line, and walking it ---------------- */
  const sel = await page.evaluate(async () => {
    const L = window.MP_GAME_LIVE;
    L.rail._open(true);
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const rail = document.querySelector('#mpui .rail');
    const border = getComputedStyle(rail).borderTopColor;
    const first = L.rail.selected;
    L.rail._move(1);
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    const second = L.rail.selected;
    const marked = document.querySelectorAll('#mpui .rail .ks.sel').length;
    return { open: rail.classList.contains('open'), border, first, second, marked };
  });
  check('opening the rail puts a line round it', sel.open === true);
  check('and the line is red', /rgb\(2\d\d, [0-9]{1,2}, [0-9]{1,2}\)/.test(sel.border),
    sel.border);
  check('up and down walk the three', sel.second === (sel.first + 1) % 3,
    `${sel.first} -> ${sel.second}`);
  check('and exactly one is marked as selected', sel.marked === 1, String(sel.marked));

  /* ---------------- the suit ---------------- */
  const call = await page.evaluate(async () => {
    const L = window.MP_GAME_LIVE;
    L.rail._open(true);
    while (L.rail.selected !== 2) L.rail._move(1);
    const ok = L.rail._call();
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    return { ok, state: L.berserker ? L.berserker.state : null,
      streakLeft: window.MP.match.you.streak,
      cine: !document.querySelector('#mpui .cine').classList.contains('hide') };
  });
  check('calling in the Berserker Suit starts the sequence', call.ok === true
    && call.state === 'throw', String(call.state));
  check('and it spends the kills that bought it', call.streakLeft === 22,
    String(call.streakLeft));
  check('with the flare in your hand and a caption on the screen', call.cine === true);

  const arc = await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    const line = document.querySelector('#mpui .throwline');
    const d = line.querySelector('path').getAttribute('d') || '';
    const pts = (d.match(/[ML]/g) || []).length;
    const ring = line.querySelector('ellipse');
    return { shown: !line.classList.contains('hide'), pts,
      rx: ring ? +ring.getAttribute('rx') : 0 };
  });
  check('the throw indicator draws an arc, not a straight line', arc.pts >= 8,
    `${arc.pts} points`);
  note(`arc drawn with ${arc.pts} points`);
  check('with a landing ring on the ground', arc.rx > 2, `rx ${arc.rx}`);

  const ride = await page.evaluate(async () => {
    const L = window.MP_GAME_LIVE, g = window.MP.game, M = window.MP.match;
    L.berserker._skipTo('ride');
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    const parts = g.actors.filter((a) => a.name && a.name.indexOf('bers-') === 0 && a.visible);
    const barrels = parts.filter((a) => /^bers-barrel/.test(a.name));
    const cam = g.camera.position;
    const me = M.you.pos;
    return {
      state: L.berserker.state, hp: L.berserker.hp, inSuit: !!M.you.inSuit,
      parts: parts.length, barrels: barrels.length,
      /* Third person: the camera must be a long way from the body. */
      back: Math.hypot(cam.x - me.x, cam.z - me.z),
      up: cam.y - me.y,
      /* Nothing of the model may be a NaN -- the mistake that made the
         multiplayer viewmodel invisible for a whole session. */
      nan: parts.some((a) => !Number.isFinite(a.position.x) || !Number.isFinite(a.position.y)
        || !Number.isFinite(a.position.z)
        || (a.rotation && !Number.isFinite(a.rotation.w))),
      /* And every part must be somewhere near the man, not still at
         the origin it was built at. */
      stray: parts.filter((a) => Math.hypot(a.position.x - me.x, a.position.z - me.z) > 6).length,
      tall: Math.max.apply(null, parts.map((a) => a.position.y)) - me.y,
      hud: !document.querySelector('#mpui .bers').classList.contains('hide'),
      cross: document.querySelector('#mpui .cross').classList.contains('hide'),
    };
  });
  check('you end up in the suit', ride.state === 'ride' && ride.inSuit === true);
  check('with ten thousand armour', ride.hp === 10000, String(ride.hp));
  check('it is built out of forty-odd parts', ride.parts > 40, String(ride.parts));
  check('including six minigun barrels', ride.barrels === 6, String(ride.barrels));
  check('nothing about it is a NaN', ride.nan === false);
  check('and no part is left at the origin it was built at', ride.stray === 0,
    `${ride.stray} strays`);
  check('it stands about twelve feet', ride.tall > 3.0 && ride.tall < 4.2,
    `${ride.tall.toFixed(2)} m`);
  check('the camera is behind it, in third person', ride.back > 4 && ride.back < 12,
    `${ride.back.toFixed(1)} m back, ${ride.up.toFixed(1)} up`);
  check('its own HUD is up', ride.hud === true);
  check('and your rifle crosshair is gone', ride.cross === true);
  await page.screenshot({ path: path.join(OUT, 'berserker.jpg'), type: 'jpeg', quality: 84 });
  note(`shot -> ${path.join(OUT, 'berserker.jpg')}`);

  const armour = await page.evaluate(async () => {
    const M = window.MP.match, L = window.MP_GAME_LIVE;
    const foe = M.people.find((p) => p.team !== M.you.team && p.alive);
    const hp0 = M.you.hp, sh0 = L.berserker.hp;
    M.damage(foe, M.you, 250, false);
    return { hp0, hp1: M.you.hp, sh0, sh1: L.berserker.hp };
  });
  check('the suit takes the round, not the man in it',
    armour.hp1 === armour.hp0 && armour.sh1 === armour.sh0 - 250,
    `you ${armour.hp0}->${armour.hp1}, suit ${armour.sh0}->${armour.sh1}`);

  const out = await page.evaluate(async () => {
    const L = window.MP_GAME_LIVE, M = window.MP.match, g = window.MP.game;
    L.berserker.dismount('killed');
    for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
    const parts = g.actors.filter((a) => a.name && a.name.indexOf('bers-') === 0 && a.visible);
    return { inSuit: !!M.you.inSuit, parts: parts.length,
      hud: !document.querySelector('#mpui .bers').classList.contains('hide') };
  });
  check('and when it dies it goes away entirely',
    out.inSuit === false && out.parts === 0 && out.hud === false,
    `${out.parts} parts left`);

  /* ---------------- three stances ---------------- */
  const stance = await page.evaluate(async () => {
    const M = window.MP.match, G = window.MP;
    /* SEQUENTIALLY. The first version built an array of n
       requestAnimationFrame promises and awaited Promise.all of them
       -- but all n callbacks are registered on the SAME frame, so they
       all fire on that frame and the whole thing resolves after ONE.
       "Hold the crouch key for twenty-six frames" held it for one,
       which is under the two-hundred-and-twenty-millisecond fence
       between a tap and a hold, so the drop never fired and the game
       took the blame for it. */
    async function pump(n) {
      for (let i = 0; i < n; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    const out = {};
    /* A TAP toggles the crouch. */
    G.input._press('c'); await pump(1); G.input._release('c'); await pump(4);
    out.tapCrouch = !!M.you.crouching;
    G.input._press('c'); await pump(1); G.input._release('c'); await pump(4);
    out.tapBack = !!M.you.crouching;
    /* A HOLD, standing still, is the drop. */
    const hp0 = M.you.hp;
    G.input._press('c'); await pump(26);
    out.hold = { prone: !!M.you.prone, hp0, hp: M.you.hp };
    G.input._release('c'); await pump(4);
    out.clip = M.you.actor && M.you.actor.animator && M.you.actor.animator.current
      ? M.you.actor.animator.current.name : null;
    return out;
  });
  check('one tap of crouch toggles it', stance.tapCrouch === true);
  check('and another stands you up', stance.tapBack === false);
  check('holding it, standing still, drops you flat', stance.hold.prone === true);
  check('and the drop costs exactly one health',
    stance.hold.hp === stance.hold.hp0 - 1,
    `${stance.hold.hp0} -> ${stance.hold.hp}`);

  /* The clips have to exist at all, which is separate from the rules
     choosing them. */
  const clips = await page.evaluate(() => {
    const a = window.MP.match.you.actor;
    const want = ['crouchIdle', 'crouchWalk', 'crouchRun', 'drop', 'proneIdle',
      'crawl', 'standUp'];
    if (!a || !a.animator || !a.animator.clips) return { missing: want };
    return { missing: want.filter((n) => !a.animator.clips.get(n)) };
  });
  check('and there is a clip for every one of the new stances',
    clips.missing.length === 0, clips.missing.join(', '));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n  ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
