#!/usr/bin/env node
/* Drives the real game with a real controller, or near enough to one.
 *
 * The Gamepad API is polled from `navigator.getGamepads()`, which means a
 * fake pad installed before the page loads is indistinguishable from a
 * physical one as far as every line of game code is concerned. So this test
 * plugs one in, pushes the sticks, presses the buttons, and checks that the
 * island responds — which is the only way to know that controller support
 * works without someone sitting there with a pad in their hands.
 *
 * Usage:  node survivor/test/gamepad.browser.test.js [--shots DIR]
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const SHOTS = process.env.SURVIVOR_SHOT_DIR || '/tmp';
const PORT = 8106;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain' };

const server = http.createServer((req, res) => {
  let p = path.join(SITE, decodeURIComponent(url.parse(req.url).pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
function section(t) { console.log(`\n${t}`); }

/* The fake pad, installed before any page script runs. `window.__pad` is the
   handle the test steers it by; everything else is exactly the shape the
   browser hands a game. */
const INSTALL_PAD = (padId) => {
  const state = {
    id: padId,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    rumbles: [],
  };
  window.__pad = state;
  const snapshot = () => ({
    index: 0,
    id: state.id,
    connected: true,
    mapping: 'standard',
    timestamp: performance.now(),
    axes: state.axes.slice(),
    buttons: state.buttons.map((b) => ({ pressed: b.pressed, value: b.value, touched: b.touched })),
    vibrationActuator: {
      playEffect: (kind, opts) => {
        state.rumbles.push(Object.assign({ kind, at: performance.now() }, opts));
        return Promise.resolve('complete');
      },
      reset: () => Promise.resolve('complete'),
    },
  });
  navigator.getGamepads = () => [snapshot(), null, null, null];
  window.__pad.set = (spec) => {
    if (spec.axes) for (let i = 0; i < spec.axes.length; i++) {
      if (spec.axes[i] != null) state.axes[i] = spec.axes[i];
    }
    if (spec.buttons) for (const [i, v] of Object.entries(spec.buttons)) {
      const value = typeof v === 'number' ? v : (v ? 1 : 0);
      state.buttons[i] = { pressed: value > 0.5, value, touched: value > 0 };
    }
  };
  window.__pad.clear = () => {
    state.axes = [0, 0, 0, 0];
    state.buttons = state.buttons.map(() => ({ pressed: false, value: 0, touched: false }));
  };
};

/* Button indices in the standard mapping. */
const B = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 };

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

  await page.addInitScript(INSTALL_PAD, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)');

  section('plugging one in');
  await page.goto(`http://localhost:${PORT}/survivor/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#startBtn:not([hidden])', { timeout: 300000 });

  /* The first thing a controller has to be able to do is start the game.
     Nothing is running at this point — no engine, no modules — so this is
     the one place core polls the pad itself. */
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.a]: 1 } }), B);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__pad.clear());
  const started = await page.evaluate(() => !!document.querySelector('canvas')
    || document.getElementById('boot').style.opacity === '0');
  check('a controller can start the game', started);
  await page.waitForTimeout(8000);

  const found = await page.evaluate(() => {
    const p = window.SURVIVOR.game.input.pad;
    return { connected: p.connected, active: p.active, family: p.family,
      scheme: window.SURVIVOR.game.input.scheme,
      log: document.getElementById('logBody').innerText };
  });
  check('the pad is found', found.connected);
  check('and identified as an Xbox pad', found.family === 'xbox', found.family);
  check('starting with it hands the prompts over',
    found.active && found.scheme === 'gamepad');
  check('and the game says so', /controller connected/i.test(found.log));

  /* And the keyboard takes them straight back. Whichever device was touched
     last owns the prompts, because a pad plugged in and sitting on the desk
     should not relabel a screen someone is playing on with a mouse. */
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(600);
  const backToKeys = await page.evaluate(() => ({
    scheme: window.SURVIVOR.game.input.scheme,
    hint: window.SURVIVOR.ctx.hint('e', 'x'),
    legend: getComputedStyle(document.getElementById('padLegend')).display,
  }));
  check('a key press hands them back to the keyboard', backToKeys.scheme === 'keyboard');
  check('the prompts go back to letters', backToKeys.hint === 'E', backToKeys.hint);
  check('and the button legend goes away', backToKeys.legend === 'none', backToKeys.legend);

  // Then back to the pad, which is where the rest of this runs.
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.y]: 1 } }), B);
  await page.waitForTimeout(500);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.y]: 0 } }), B);
  await page.waitForTimeout(600);
  check('and touching the pad takes them again',
    await page.evaluate(() => window.SURVIVOR.game.input.scheme === 'gamepad'));

  section('the sticks');
  const before = await page.evaluate(() => {
    const S = window.SURVIVOR;
    return { x: S.player.x, z: S.player.z, yaw: S.game._camYaw, pitch: S.game._camPitch };
  });
  await page.evaluate(() => window.__pad.set({ axes: [0, -1, 0, 0] }));
  // A frame a second on the software rasteriser, and movement is driven by
  // the clamped frame delta, so this is under a second of simulated walking.
  await page.waitForTimeout(7000);
  await page.evaluate(() => window.__pad.clear());
  await page.waitForTimeout(600);
  const walked = await page.evaluate(() => ({ x: window.SURVIVOR.player.x, z: window.SURVIVOR.player.z }));
  const moved = Math.hypot(walked.x - before.x, walked.z - before.z);
  check('the left stick walks you', moved > 0.3, `${moved.toFixed(2)} m`);

  await page.evaluate(() => window.__pad.set({ axes: [0, 0, 1, 0] }));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__pad.clear());
  await page.waitForTimeout(400);
  const turned = await page.evaluate(() => ({ yaw: window.SURVIVOR.game._camYaw, pitch: window.SURVIVOR.game._camPitch }));
  check('the right stick turns you', Math.abs(turned.yaw - before.yaw) > 0.2,
    `${(turned.yaw - before.yaw).toFixed(2)} rad`);
  check('and only in yaw when it is pushed sideways',
    Math.abs(turned.pitch - before.pitch) < 0.05);

  // A stick at rest must not drift the view.
  const still0 = await page.evaluate(() => window.SURVIVOR.game._camYaw);
  await page.waitForTimeout(2500);
  const still1 = await page.evaluate(() => window.SURVIVOR.game._camYaw);
  check('a resting stick does not drift the view', Math.abs(still1 - still0) < 1e-6,
    `${(still1 - still0).toFixed(6)} rad over 2.5 s`);

  section('the d-pad opens the screens');
  const SCREENS = [
    ['right', 'inventory'], ['left', 'map'], ['down', 'condition'], ['up', 'build'],
  ];
  for (const [btn, name] of SCREENS) {
    const errsBefore = errors.length;
    await page.evaluate(([b, k]) => window.__pad.set({ buttons: { [b[k]]: 1 } }), [B, btn]);
    await page.waitForTimeout(400);
    await page.evaluate(([b, k]) => window.__pad.set({ buttons: { [b[k]]: 0 } }), [B, btn]);
    await page.waitForTimeout(900);
    const open = await page.evaluate(() => {
      const vis = [...document.querySelectorAll('.screen')].filter((s) => !s.hidden);
      return {
        ids: vis.map((s) => s.id || s.className),
        menu: !!window.SURVIVOR.ctx.state.buildMenuOpen,
      };
    });
    const showed = open.ids.length > 0 || open.menu;
    check(`${btn} opens ${name}`, showed && errors.length === errsBefore,
      `${open.ids.join(',') || (open.menu ? 'build panel' : 'nothing')} ${errors.slice(errsBefore).join(' | ')}`);
    // Back out again.
    await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 1 } }), B);
    await page.waitForTimeout(350);
    await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 0 } }), B);
    await page.waitForTimeout(700);
  }
  const clear = await page.evaluate(() => ({
    screens: [...document.querySelectorAll('.screen')].filter((s) => !s.hidden).map((s) => s.id || s.className),
    build: !!window.SURVIVOR.ctx.state.buildMenuOpen,
  }));
  check('and B backs out of every one of them',
    clear.screens.length === 0 && !clear.build,
    `${clear.screens.join(',')}${clear.build ? ' build panel' : ''} still open`);

  section('walking a sheet with the stick');
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.right]: 1 } }), B);
  await page.waitForTimeout(350);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.right]: 0 } }), B);
  await page.waitForTimeout(1200);
  const focus0 = await page.evaluate(() => (document.activeElement && document.activeElement.textContent || '').trim());
  await page.evaluate(() => window.__pad.set({ axes: [0, 1, 0, 0] }));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__pad.clear());
  await page.waitForTimeout(500);
  const focus1 = await page.evaluate(() => ({
    text: (document.activeElement && document.activeElement.textContent || '').trim(),
    tag: document.activeElement && document.activeElement.tagName,
    inSheet: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.sheet')),
  }));
  check('the stick moves focus onto a control in the sheet',
    focus1.inSheet && focus1.tag === 'BUTTON', `${focus1.tag} "${focus1.text}"`);
  check('and moving it changes which one', focus1.text !== focus0 || focus0 === '',
    `"${focus0}" -> "${focus1.text}"`);
  await page.screenshot({ path: path.join(SHOTS, 'pad-sheet-focus.png') });
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 1 } }), B);
  await page.waitForTimeout(350);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 0 } }), B);
  await page.waitForTimeout(800);

  section('the wheel');
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.lb]: 1 } }), B);
  await page.waitForTimeout(900);
  const wheelUp = await page.evaluate(() => {
    const el = document.getElementById('padWheel');
    return {
      shown: !el.hidden && getComputedStyle(el).display !== 'none',
      locked: !!window.SURVIVOR.ctx.state.movementLocked,
    };
  });
  check('holding LB raises the wheel', wheelUp.shown);
  check('and the stick stops walking you while it is up', wheelUp.locked);
  await page.screenshot({ path: path.join(SHOTS, 'pad-wheel.png') });

  // Point at the top wedge — "Fire" — and let go.
  await page.evaluate(() => window.__pad.set({ axes: [0, -1, 0, 0] }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'pad-wheel-picked.png') });
  const errsBeforePick = errors.length;
  await page.evaluate(() => window.__pad.clear());
  await page.waitForTimeout(1500);
  const afterWheel = await page.evaluate(() => ({
    shown: !document.getElementById('padWheel').hidden
      || getComputedStyle(document.getElementById('padWheel')).display !== 'none',
    locked: !!window.SURVIVOR.ctx.state.movementLocked,
    verb: window.SURVIVOR.ctx.state.lastWheelVerb || null,
    log: document.getElementById('logBody').innerText,
  }));
  check('letting go closes it', !afterWheel.shown);
  check('and hands movement back', !afterWheel.locked);
  check('and the verb it was pointing at ran',
    !!afterWheel.verb && afterWheel.verb.key === 'f',
    afterWheel.verb ? `${afterWheel.verb.label} (${afterWheel.verb.key})` : 'nothing ran');
  check('without throwing', errors.length === errsBeforePick, errors.slice(errsBeforePick).join(' | '));

  section('the trigger');
  await page.evaluate(() => {
    const S = window.SURVIVOR;
    // A rifle and something to put in it, so the trigger has work to do.
    S.ctx.press('1');
    const inv = S.player.inventory;
    inv.add({ item: 'ammo:308win', massKg: 0.024, volumeL: 0.006, stackable: true, quantity: 20 });
  });
  await page.waitForTimeout(900);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.rb]: 1 } }), B);   // load
  await page.waitForTimeout(400);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.rb]: 0 } }), B);
  await page.waitForTimeout(1200);

  const shots = await page.evaluate(async (b) => {
    const S = window.SURVIVOR;
    let heard = 0;
    S.ctx.on('gunshot', () => { heard++; });
    window.__pad.set({ buttons: { [b.rt]: 1 } });
    await new Promise((r) => setTimeout(r, 2500));
    window.__pad.set({ buttons: { [b.rt]: 0 } });
    await new Promise((r) => setTimeout(r, 500));
    const w = S.ctx.state.currentWeapon;
    return { heard, rumbles: window.__pad.rumbles.length, loaded: w ? w.magazine.length : -1 };
  }, B);
  check('the right trigger fires the rifle', shots.heard >= 1, `${shots.heard} shots`);
  /* A bolt gun fires once however long you hold the trigger. Holding it down
     for two and a half seconds and getting a magazine's worth would mean the
     action was being ignored. */
  check('and a bolt action fires once for one pull', shots.heard === 1, `${shots.heard} shots`);
  check('and the pad is told to shake', shots.rumbles > 0, `${shots.rumbles} rumbles`);

  section('aiming');
  const aim = await page.evaluate(async (b) => {
    const S = window.SURVIVOR;
    const before = S.game.input.lookSensitivity;
    window.__pad.set({ buttons: { [b.lt]: 1 } });
    await new Promise((r) => setTimeout(r, 1200));
    const aiming = { on: !!S.ctx.state.aiming, sens: S.game.input.lookSensitivity, fov: S.game.camera.fov };
    window.__pad.set({ buttons: { [b.lt]: 0 } });
    await new Promise((r) => setTimeout(r, 1500));
    return { before, aiming, after: { on: !!S.ctx.state.aiming, sens: S.game.input.lookSensitivity, fov: S.game.camera.fov } };
  }, B);
  check('the left trigger brings the sight up', aim.aiming.on && !aim.after.on);
  check('it narrows the field of view', aim.aiming.fov < aim.after.fov,
    `${aim.aiming.fov.toFixed(3)} rad aimed vs ${aim.after.fov.toFixed(3)} rad at rest`);
  check('and it slows the stick down', aim.aiming.sens < aim.after.sens,
    `${aim.aiming.sens.toFixed(2)} vs ${aim.after.sens.toFixed(2)}`);

  section('the HUD speaks the pad’s language');
  const prompts = await page.evaluate(() => {
    const S = window.SURVIVOR;
    return {
      interact: S.ctx.hint('e', 'x'),
      fire: S.ctx.hint('u', 'y'),
      keyboardStill: S.ctx.hint('e', null),
      help: document.getElementById('help').innerText,
    };
  });
  check('a prompt asks for the pad button, not the key', prompts.interact === 'X', prompts.interact);
  check('and a verb with no pad button keeps its key', prompts.keyboardStill === 'E');

  section('every verb is reachable');
  const parity = await page.evaluate(() => {
    const S = window.SURVIVOR;
    const bound = S.ctx.bindings.map((b) => b.binding);
    return { bound: Array.from(new Set(bound)).sort() };
  });
  /* The pad reaches a verb either through a button, through the wheel, or
     through a screen it can open and navigate. Anything not in one of those
     three sets is unreachable with a controller in your hands. */
  const ON_BUTTONS = ['e', 'tab', 'm', 'c', 'n', 'enter', 'l', 'i', 'y', 'escape', 'h',
    // 1-5 are the weapons, walked by the right stick click; 1-7 are the build
    // pieces, walked by the d-pad while the build menu is up.
    '1', '2', '3', '4', '5', '6', '7', 'q', 'r', 'b', '[', ']'];
  const ON_WHEEL = await page.evaluate(() => {
    const S = window.SURVIVOR;
    const seen = new Set();
    // Every context's wheel, read from the game rather than guessed at.
    for (const ctxName of ['foot', 'fishing', 'driving', 'riding']) {
      S.ctx.state.fishing = ctxName === 'fishing';
      S.ctx.state.driving = ctxName === 'driving';
      S.ctx.state.riding = ctxName === 'riding';
      for (const page of [0, 1]) {
        S.ctx.state.__wheelPageProbe = page;
        for (const slot of (S.ctx.state.wheelProbe ? S.ctx.state.wheelProbe(page) : [])) {
          if (slot.key) seen.add(slot.key);
        }
      }
    }
    S.ctx.state.fishing = false; S.ctx.state.driving = false; S.ctx.state.riding = false;
    return Array.from(seen);
  });
  const reachable = new Set([...ON_BUTTONS, ...ON_WHEEL]);
  // 'o' is creative-mode flight: it is bound only in creative worlds, and in
  // one it takes the last wedge of the wheel's second page.
  const unreachable = parity.bound.filter((k) => !reachable.has(k) && k !== 'o');
  check('every bound verb has a way in from the pad', unreachable.length === 0,
    unreachable.length ? `no pad route to: ${unreachable.join(', ')}` : `${parity.bound.length} verbs`);
  console.log(`       verbs: ${parity.bound.join(' ')}`);
  console.log(`       wheel: ${ON_WHEEL.join(' ')}`);

  section('the legend');
  const legend = await page.evaluate(() => {
    const el = document.getElementById('padLegend');
    return { shown: el && getComputedStyle(el).display !== 'none', text: el ? el.innerText : '' };
  });
  check('a button legend is on screen', legend.shown, legend.text.slice(0, 80));
  check('and it names buttons in the pad’s own glyphs', /\bA\b|\bB\b|\bX\b|\bLB\b|\bRT\b/.test(legend.text),
    legend.text.replace(/\n/g, ' ').slice(0, 120));

  section('the map takes a mark');
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.left]: 1 } }), B);
  await page.waitForTimeout(350);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.left]: 0 } }), B);
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__pad.set({ axes: [0.8, 0.6, 0, 0] }));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__pad.clear());
  await page.waitForTimeout(500);
  const marks = await page.evaluate(async (b) => {
    const S = window.SURVIVOR;
    let got = null;
    S.ctx.on('waypoint', (w) => { got = w; });
    window.__pad.set({ buttons: { [b.a]: 1 } });
    await new Promise((r) => setTimeout(r, 700));
    window.__pad.set({ buttons: { [b.a]: 0 } });
    await new Promise((r) => setTimeout(r, 700));
    return got;
  }, B);
  check('the stick drives a cursor and A drops a mark on it', !!marks,
    marks ? `${marks.x.toFixed(0)}, ${marks.z.toFixed(0)}` : 'no waypoint');
  await page.screenshot({ path: path.join(SHOTS, 'pad-map-cursor.png') });
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 1 } }), B);
  await page.waitForTimeout(350);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 0 } }), B);
  await page.waitForTimeout(900);

  section('the pad still works while the game is paused');
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.start]: 1 } }), B);
  await page.waitForTimeout(400);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.start]: 0 } }), B);
  await page.waitForTimeout(1400);
  const paused = await page.evaluate(async () => {
    const S = window.SURVIVOR;
    const el = document.getElementById('menuScreen');
    // Walk focus with the stick while the world is stopped.
    window.__pad.set({ axes: [0, 1, 0, 0] });
    await new Promise((r) => setTimeout(r, 1400));
    window.__pad.clear();
    await new Promise((r) => setTimeout(r, 500));
    return {
      open: !!(el && !el.hidden),
      focused: !!(document.activeElement && document.activeElement.closest
        && document.activeElement.closest('#menuScreen')),
      what: (document.activeElement && document.activeElement.textContent || '').trim().slice(0, 40),
    };
  });
  check('the menu is up', paused.open);
  check('and the stick still moves focus inside it', paused.focused, paused.what);
  await page.screenshot({ path: path.join(SHOTS, 'pad-menu-focus.png') });

  // A slider has to be changeable, not just focusable.
  const slider = await page.evaluate(async () => {
    const el = document.getElementById('padSens');
    if (!el) return { missing: true };
    el.focus();
    const before = parseFloat(el.value);
    window.__pad.set({ axes: [1, 0, 0, 0] });
    await new Promise((r) => setTimeout(r, 1400));
    window.__pad.clear();
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: parseFloat(el.value), opt: window.SURVIVOR.ctx.state.gamepadOptions.sensitivity };
  });
  check('a slider moves with the stick rather than losing focus',
    !slider.missing && slider.after > slider.before,
    slider.missing ? 'no controller slider' : `${slider.before} -> ${slider.after}`);
  check('and the setting behind it followed', !slider.missing
    && Math.abs(slider.opt - slider.after) < 1e-6, `${slider.opt}`);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 1 } }), B);
  await page.waitForTimeout(400);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.b]: 0 } }), B);
  await page.waitForTimeout(900);

  section('dying and coming back');
  /* The death screen is the one place a player has no choice but to press a
     button, and it is shown with the game paused — which is exactly the
     state that used to freeze the pad. */
  await page.evaluate(() => {
    const S = window.SURVIVOR;
    S.player.body.bodyWaterL = 1;      // dehydration, quickly
    S.world.step(300);
  });
  await page.waitForTimeout(2500);
  const dead = await page.evaluate(() => {
    const el = document.getElementById('gameover');
    return { shown: !!(el && !el.hidden), text: el ? el.innerText.replace(/\n/g, ' ') : '' };
  });
  if (dead.shown) {
    check('the death screen is up', true, dead.text.slice(0, 60));
    await page.evaluate((b) => window.__pad.set({ buttons: { [b.a]: 1 } }), B);
    await page.waitForTimeout(600);
    await page.evaluate((b) => window.__pad.set({ buttons: { [b.a]: 0 } }), B);
    await page.waitForTimeout(400);
    await page.evaluate((b) => window.__pad.set({ buttons: { [b.a]: 1 } }), B);
    await page.waitForTimeout(600);
    await page.evaluate((b) => window.__pad.set({ buttons: { [b.a]: 0 } }), B);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, 'pad-death.png') });
    const back = await page.evaluate(() => ({
      gone: document.getElementById('gameover').hidden,
      alive: window.SURVIVOR.player.body.alive,
    }));
    check('and A brings you back with the pad alone', back.gone && back.alive,
      `screen ${back.gone ? 'closed' : 'still up'}, ${back.alive ? 'alive' : 'dead'}`);
  } else {
    check('the death screen is up', false, 'the player did not die');
  }

  section('settings');
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.start]: 1 } }), B);
  await page.waitForTimeout(400);
  await page.evaluate((b) => window.__pad.set({ buttons: { [b.start]: 0 } }), B);
  await page.waitForTimeout(1500);
  const menu = await page.evaluate(() => {
    const el = document.getElementById('menuScreen');
    return { open: !!(el && !el.hidden), text: el ? el.innerText : '' };
  });
  check('Start opens the menu', menu.open);
  const wheelGone = await page.evaluate(() =>
    getComputedStyle(document.getElementById('padWheel')).display === 'none');
  check('and the wheel is not still painted over it', wheelGone);
  check('which has a controller page', /controller/i.test(menu.text));
  check('naming the pad it found', /xbox/i.test(menu.text));
  check('and listing what the buttons do', /the wheel/i.test(menu.text));
  await page.screenshot({ path: path.join(SHOTS, 'pad-settings.png') });
  // And the controller page itself, which is the one a pad player reads.
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('#menuScreen h2')].find((x) => /controller/i.test(x.textContent));
    if (h) h.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'pad-settings-controller.png') });

  section('unplugging');
  await page.evaluate(() => { navigator.getGamepads = () => [null, null, null, null]; });
  await page.waitForTimeout(1500);
  const gone = await page.evaluate(() => {
    const S = window.SURVIVOR;
    return {
      connected: S.game.input.pad.connected,
      sprint: !!S.ctx.state.sprintHeld,
      trigger: !!S.ctx.state.triggerHeld,
      drive: !!S.ctx.state.driveInput,
    };
  });
  check('losing the pad is noticed', !gone.connected);
  check('and nothing is left held down', !gone.sprint && !gone.trigger && !gone.drive);

  section('overall');
  check('no console error at any point', errors.length === 0, errors.slice(0, 4).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) { console.log('\nFailures:'); for (const f of failures) console.log(`  - ${f}`); }
  console.log(`screenshots in ${SHOTS}`);
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})();
