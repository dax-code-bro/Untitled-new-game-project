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

  check('the shell exposes every screen', has.fns.length === 6, has.fns.join(','));
  check('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  for (const [id] of screens) note(`shot -> ${path.join(OUT, `menu-${id}.jpg`)}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
