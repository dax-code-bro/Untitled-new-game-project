// Scripted in-game check: load the game, run steps, capture screenshots, report errors.
//   node tools/southbound/check.mjs <outDir> <steps.json> [preset]
// steps: [{ "eval": "SB.teleport(...)", "wait": 1500, "shot": "name", "frames": 3 }]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../site/southbound');
const out = path.resolve(process.argv[2] || 'check-out');
const steps = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const preset = process.argv[4] || 'high';
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const phone = preset === 'phone';
const page = await browser.newPage({ viewport: phone ? { width: 844, height: 390 } : { width: W, height: H }, hasTouch: phone });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.text().startsWith('[check]')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript((pr) => {
  try {
    localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: pr === 'phone' ? 'phone' : 'pc', preset: pr, dynamicRes: false, showFps: true, timeScale: 0 }));
    if (!sessionStorage.getItem('keepSave')) localStorage.removeItem('southbound.save.v1');
  } catch (e) { /* ignore */ }
}, preset);
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForTimeout(600);
await page.click('#play');
await page.waitForFunction(() => window.SB && window.SB.state, null, { timeout: 400000 });
await page.waitForTimeout(1500);
for (const s of steps) {
  if (s.eval) {
    try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('[eval]', JSON.stringify(r).slice(0, 400)); } catch (e) { errors.push('[eval] ' + e.message); console.log('[eval error]', e.message); }
  }
  if (s.frames) await page.evaluate((n) => window.SB.step(n, 1 / 30), s.frames);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) {
    await page.evaluate(() => window.SB.freeze(true));
    try { await page.screenshot({ path: path.join(out, s.shot + '.png'), timeout: 240000 }); }
    catch (e) {
      // the compositor is too slow: grab the WebGL canvas instead (no HTML UI on top)
      const data = await page.evaluate(() => { window.SB.renderer.render(window.SB.scene, window.SB.camera); return window.SB.renderer.domElement.toDataURL('image/png'); });
      const base = Buffer.from(data.split(',')[1], 'base64');
      try {
        // HUD layer on its own (no WebGL to wait for), composited over the 3D frame
        await page.evaluate(() => { document.querySelector('canvas#game').style.visibility = 'hidden'; document.body.style.background = 'transparent'; document.documentElement.style.background = 'transparent'; });
        const hud = await page.screenshot({ omitBackground: true, timeout: 120000 });
        await page.evaluate(() => { document.querySelector('canvas#game').style.visibility = ''; document.body.style.background = ''; document.documentElement.style.background = ''; });
        const sharp = require('sharp');
        const meta = await sharp(hud).metadata();
        const img = await sharp(base).resize(meta.width, meta.height).composite([{ input: hud }]).png().toBuffer();
        fs.writeFileSync(path.join(out, s.shot + '.png'), img);
      } catch (e2) { fs.writeFileSync(path.join(out, s.shot + '.png'), base); }
    }
    if (!s.keepFrozen) await page.evaluate(() => window.SB.freeze(false));
    console.log('shot', s.shot);
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 30).join('\n') : 'no errors');
await browser.close();
server.close();
