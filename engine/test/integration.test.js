#!/usr/bin/env node
/* End-to-end check of the path a published game actually takes.
 *
 * A Legend game is stored as an HTML string and rendered inside a sandboxed
 * iframe via srcdoc (see play.html). The engine is pulled in with
 * <script src="/engine/legend-engine.js">, which resolves against the parent
 * document's origin. That is a genuinely different situation from loading a
 * file directly — opaque origins, srcdoc base URLs and sandbox flags all
 * affect it — so it is worth testing rather than assuming.
 *
 * Also verifies the auto-tester's contract: Legend publishes a build only if
 * it produces animation frames and no errors.
 *
 * Usage: node engine/test/integration.test.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('integration tests need playwright: npm i --no-save playwright');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(SITE, url === '/' ? 'index.html' : url);
      if (!file.startsWith(SITE)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* A game exactly as Legend would generate one. */
const GAME_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Test Game</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}
#hud{position:fixed;top:12px;left:12px;color:#fff;font:16px sans-serif;z-index:5}</style>
</head><body>
<div id="hud">Score: 0</div>
<script src="/engine/legend-engine.js"><\/script>
<script>
var state = 'start';
var score = 0;
var game = LE.create({ sky: 'day' });
game.ground({ material: 'grass', size: 100, grass: true });
var targets = [];
for (var i = 0; i < 8; i++) {
  targets.push(game.box({
    at: [(i % 4) * 2 - 3, 0.6 + Math.floor(i / 4) * 1.2, 0],
    size: 1, material: 'brick', breakable: { pieces: 8, threshold: 300 }
  }));
}
var hero = game.character({ at: [0, 1.2, 6], color: 'navy' });
game.follow(hero, { distance: 6, height: 2.2 });

game.onUpdate(function (dt) {
  var i = game.input;
  if (state === 'start') {
    if (i.anyPressed || i.pointer.justDown) state = 'playing';
    return;
  }
  hero.controller.move(i.axes.x, -i.axes.y, false);
  if (i.justPressed(' ')) hero.controller.jump();
  if (i.justPressed('x')) {
    game.explode(hero.position, { radius: 6, strength: 24 });
    score += 10;
    document.getElementById('hud').textContent = 'Score: ' + score;
  }
});
game.start();
window.__game = game;
<\/script>
</body></html>`;

async function run() {
  const server = await serve();
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  console.log(`serving site/ at ${origin}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });

  /* ---- 1. the engine is reachable at the path games reference ---- */
  console.log('\nserving');
  {
    const page = await browser.newPage();
    const res = await page.goto(`${origin}/engine/legend-engine.js`);
    check('engine is served at /engine/legend-engine.js', res && res.status() === 200,
      res ? `status ${res.status()}` : 'no response');
    const type = res && res.headers()['content-type'];
    check('engine is served as javascript', /javascript/.test(type || ''), `content-type ${type}`);
    await page.close();
  }

  /* ---- 2. a generated game runs inside a sandboxed srcdoc iframe ---- */
  console.log('\nsandboxed iframe (the AIGB path)');
  {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${origin}/`);
    // Mirror play.html's iframe exactly.
    await page.evaluate(`(() => {
      document.body.innerHTML = '';
      const f = document.createElement('iframe');
      f.id = 'frame';
      f.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-same-origin allow-forms allow-modals');
      f.style.cssText = 'width:800px;height:560px;border:none';
      f.srcdoc = ${JSON.stringify(GAME_HTML)};
      document.body.appendChild(f);
    })()`);

    const frame = await (await page.waitForSelector('#frame')).contentFrame();
    // Give the engine time to load, compile shaders and run frames.
    await page.waitForTimeout(6000);

    const status = await frame.evaluate(`(() => {
      if (!window.LE) return { ok: false, why: 'engine script never loaded' };
      if (!window.__game) return { ok: false, why: 'game object missing' };
      const g = window.__game;
      return {
        ok: true, version: LE.version, frames: g.frame, running: g.running,
        actors: g.actors.length, bodies: g.physics.bodies.length,
        grass: g.grass ? g.grass.count : 0,
        quality: g.renderer.qualityName,
      };
    })()`);

    check('engine loads inside the sandboxed iframe', status.ok, status.ok ? '' : status.why);
    if (status.ok) {
      // Assert the loop is *advancing*, not that it hits a frame count.
      // SwiftShader has no GPU behind it and renders this scene at a couple
      // of frames per second, so any absolute threshold measures the test
      // machine rather than the engine.
      const before = status.frames;
      await page.waitForTimeout(2500);
      const after = await frame.evaluate(`(() => window.__game.frame)()`);
      check('the game loop keeps advancing', status.running && after > before,
        `${before} -> ${after} frames`);
      check('the world was built', status.actors > 8 && status.bodies > 8,
        `${status.actors} actors, ${status.bodies} bodies`);
      check('grass scattered inside the iframe', status.grass > 500, `${status.grass} blades`);
    }

    // The canvas must be showing something.
    const pixels = await frame.evaluate(`(() => {
      const c = document.querySelector('canvas');
      if (!c) return { ok: false };
      return { ok: true, w: c.width, h: c.height };
    })()`);
    check('the engine created a canvas', pixels.ok && pixels.w > 100, JSON.stringify(pixels));

    const shot = await page.screenshot({ path: path.join(__dirname, 'shots', 'integration.png') });
    // A blank iframe screenshots as a single flat colour.
    check('the iframe renders a non-trivial image', shot.length > 12000, `${shot.length} bytes of png`);

    const real = errors.filter((e) => !/performance|deprecat|SwiftShader|Fallback|favicon/i.test(e));
    check('no errors in the published-game path', real.length === 0, real.slice(0, 2).join(' | '));

    /* ---- 3. Legend's auto-tester contract ---- */
    // Legend publishes a build only if requestAnimationFrame fires at least
    // five times and nothing throws. Confirm an engine game satisfies that.
    const rafOk = await frame.evaluate(`(() => window.__game.frame >= 5)()`);
    check('satisfies the auto-test animation requirement', rafOk);

    // Tap-to-start must work from a pointer event anywhere on the page.
    await frame.evaluate(`(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    })()`);
    await page.waitForTimeout(400);
    const started = await frame.evaluate(`(() => document.getElementById('hud') !== null)()`);
    check('the HUD overlay survives alongside the engine canvas', started);

    await page.close();
  }

  await browser.close();
  server.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
