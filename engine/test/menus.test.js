#!/usr/bin/env node
/* WHERE THE MENUS ARE.
 *
 * Reported as missing: the main menu, the settings, the zombies and
 * multiplayer screens, the gun and attachment picker. None of them was
 * deleted. Every link handed over for the last several rounds pointed
 * at multiplayer.html, which is the straight-into-a-match entry point
 * and has no shell at all -- the menus live on bunker-nine.html.
 *
 * Saying so is not enough, since saying so without looking is how most
 * of this session went. This opens each screen in turn and photographs
 * it.
 *
 * Usage: node engine/test/menus.test.js
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
  const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto('file://' + path.join(ROOT, 'site/games/bunker-nine.html'));
  /* BUNKER_SHELL, not SHELL. The shell's global has always been
     BUNKER_SHELL and `window.SHELL` is nothing -- which this test spent
     three minutes waiting for, and which a graphics notice in zombies
     had been quietly failing to find for just as long. */
  await page.waitForFunction(() => window.BUNKER_SHELL, null, { timeout: 300000 });
  /* The shell builds the world behind the title card; wait for it to
     hand over rather than guessing at a delay. */
  await page.waitForFunction(() => window.BUNKER_SHELL && window.BUNKER_SHELL.ready !== false,
    null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const has = await page.evaluate(() => ({
    shell: !!window.BUNKER_SHELL,
    fns: ['openMain', 'openMaps', 'openMP', 'openLoadout', 'openSettings', 'openPause']
      .filter((k) => typeof window.BUNKER_SHELL[k] === 'function'),
    root: !!document.querySelector('#shell, .shell, #ui'),
  }));
  note(`SHELL exposes: ${has.fns.join(', ') || '(nothing)'}`);

  /* Each screen, opened and photographed. */
  const screens = [
    ['main', 'the main menu', () => window.BUNKER_SHELL.openMain && window.BUNKER_SHELL.openMain()],
    ['maps', 'the zombies map select', () => window.BUNKER_SHELL.openMaps && window.BUNKER_SHELL.openMaps()],
    ['mp-lobby', 'the multiplayer lobby', () => window.BUNKER_SHELL.openMP && window.BUNKER_SHELL.openMP('lobby')],
    ['mp-loadout', 'the gun and attachment picker',
      () => window.BUNKER_SHELL.openMP && window.BUNKER_SHELL.openMP('loadout')],
    ['mp-operators', 'the operators tab',
      () => window.BUNKER_SHELL.openMP && window.BUNKER_SHELL.openMP('operators')],
    ['settings', 'the settings screen',
      () => window.BUNKER_SHELL.openSettings && window.BUNKER_SHELL.openSettings('main')],
  ];
  const seen = {};
  for (const [id, label, fn] of screens) {
    const ok = await page.evaluate(fn).then(() => true).catch(() => false);
    await page.waitForTimeout(1400);
    const vis = await page.evaluate(() => {
      const r = document.body.innerText || '';
      return { text: r.slice(0, 160).replace(/\s+/g, ' ').trim(), len: r.length };
    });
    seen[id] = vis.len;
    note(`${label}: ${vis.len} characters on screen — "${vis.text.slice(0, 90)}"`);
    await page.screenshot({ path: path.join(OUT, `menu-${id}.jpg`), type: 'jpeg', quality: 84 });
    check(`${label} opens and draws something`, ok && vis.len > 40, `${vis.len} chars`);
  }

  /* THE OPERATOR IS A REAL MAN NOW, not an SVG stick figure. */
  const st = await page.evaluate(async () => {
    window.BUNKER_SHELL.openMP('operators');
    await new Promise((r) => setTimeout(r, 2500));
    const s = window.MENU_STAGE;
    if (!s) return { err: 'no stage' };
    const sub = s.subject;
    return {
      kind: s.kind, id: s.id, has: !!sub,
      parts: sub ? (sub.rigged ? sub.rigged.length : 0) : 0,
      verts: sub && sub.mesh ? sub.mesh.vertexCount : 0,
      entering: s.entering, facing: +s.facing.toFixed(3),
      staged: document.querySelector('#b9shell').classList.contains('staged'),
      /* IS THE CAMERA ACTUALLY ON HIM? The stage sits four hundred
         metres under the map, so this is unambiguous: a camera still
         up at the bunker is looking at the wrong thing entirely, and
         the first screenshot of this feature showed the zombies game
         with its own ammo counter rather than the operator. */
      camY: +window.BUNKER_SHELL.handle().game.camera.position.y.toFixed(1),
      subY: sub && sub.controller ? +sub.controller.body.position.y.toFixed(1) : null,
      hudHidden: !document.getElementById('b9hud')
        || getComputedStyle(document.getElementById('b9hud')).display === 'none',
    };
  });
  note(`stage: ${JSON.stringify(st)}`);
  check('the operator selector stages a real body', !st.err && st.has && st.kind === 'op',
    JSON.stringify(st));
  check('and the menu is cut open so he can be seen', st.staged === true);
  check('the camera is down on the stage, not up at the map',
    st.camY < -300, `camera y ${st.camY}, subject y ${st.subY}`);
  /* And the MAN is on the stage too. The stage floor has no physics, so
     there is nothing holding him up: the first version let the
     controller's out-of-world recovery carry him forty metres above
     the camera while every other check passed. */
  check('and the man is standing on it, not floating above it',
    st.subY != null && Math.abs(st.subY - st.camY) < 3,
    `camera ${st.camY}, man ${st.subY}`);
  check("and the game's own HUD is not floating over him", st.hudHidden === true);

  /* And turning him TAKES TIME. */
  /* STEPPED AT A FIXED 1/60. The engine clamps a long frame at 0.1s and
     SwiftShader delivers about two frames a second, so a turn that
     takes two thirds of a second of GAME time takes many seconds of
     wall time here -- and a check written against the wall clock
     reports a working turn as an unfinished one. It reported exactly
     that: 0.735 of the 1.571 asked for, which is three frames of
     correct turning. */
  const turn = await page.evaluate(async (steps) => {
    const s = window.MENU_STAGE, g = window.BUNKER_SHELL.handle().game;
    const before = s.facing;
    s.turn(Math.PI * 0.5);
    g.stop();
    let mid = before;
    for (let i = 0; i < steps; i++) {
      g.step(1 / 60);
      if (i === 5) mid = s.facing;
    }
    const end = s.facing;
    g.start();
    return { before: +before.toFixed(3), mid: +mid.toFixed(3), end: +end.toFixed(3),
      want: +s.target.toFixed(3), steps };
  }, 60);
  note(`turn: ${turn.before} -> ${turn.mid} -> ${turn.end} (asked ${turn.want})`);
  check('he turns rather than snapping -- part way after six frames',
    Math.abs(turn.mid - turn.want) > 0.15 && turn.mid > turn.before + 0.05,
    JSON.stringify(turn));
  check('and he gets all the way there',
    Math.abs(turn.end - turn.want) < 0.12, JSON.stringify(turn));
  await page.screenshot({ path: path.join(OUT, 'menu-operator3d.jpg'), type: 'jpeg', quality: 86 });
  note(`shot -> ${path.join(OUT, 'menu-operator3d.jpg')}`);

  check('the shell exposes every screen', has.fns.length === 6, has.fns.join(','));
  check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  for (const [id] of screens) note(`shot -> ${path.join(OUT, `menu-${id}.jpg`)}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
