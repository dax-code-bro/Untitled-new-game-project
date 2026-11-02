// A/B render test: same frame through the full post chain vs a raw render, plus noise stats.
//   node tools/southbound/abtest.mjs <out> <setupJS> <x0,y0,x1,y1 region>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); const sharp = require('sharp');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../site/southbound');
const [out, setup, region] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: 'high', dynamicRes: false, showFps: false, timeScale: 0 })); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForTimeout(500); await page.click('#play');
await page.waitForFunction(() => window.SB && window.SB.state, null, { timeout: 600000 });
await page.waitForTimeout(3000);
await page.evaluate(setup);
await page.evaluate(() => window.SB.step(6, 1 / 30));
const grab = async (raw) => {
  const d = await page.evaluate((raw) => { const S = window.SB; if (raw) S.renderer.render(S.scene, S.camera); else S.step(1, 1 / 30); return S.renderer.domElement.toDataURL('image/png'); }, raw);
  return Buffer.from(d.split(',')[1], 'base64');
};
const [x0, y0, x1, y1] = region.split(',').map(Number);
const pick = await page.evaluate(([px, py]) => {
  const S = window.SB, T = S.THREE; const rc = new T.Raycaster();
  rc.setFromCamera(new T.Vector2(px / 640 - 1, 1 - py / 360), S.camera);
  const hits = rc.intersectObjects(S.scene.children, true).slice(0, 6);
  return hits.map((h) => ({ d: +h.distance.toFixed(4), type: h.object.type, name: h.object.name, mat: h.object.material && (h.object.material.name || h.object.material.type), inst: h.instanceId, parent: h.object.parent && (h.object.parent.name || h.object.parent.type) }));
}, [505, 275]);
console.log('pick', JSON.stringify(pick));
const dbg = (mode) => ({ mode });
const variants = [['raw-base', ''], ['dbg-albedo', dbg('gl_FragColor = vec4(diffuseColor.rgb, 1.0);')]];
for (const [name, js] of variants) {
  if (js && js.mode) await page.evaluate((mode) => {
    const S = window.SB; let bm = null;
    S.scene.traverse((o) => { if (o.isInstancedMesh && o.count > 300 && !bm && o.material && o.material.onBeforeCompile && o.geometry.attributes.aInfo) bm = o; });
    const m = bm.material; if (!m.__orig) m.__orig = m.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) { m.__orig.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + mode); };
    m.customProgramCacheKey = () => 'dbg' + mode; m.needsUpdate = true;
  }, js.mode);
  else if (js) await page.evaluate(js);
  const buf = await grab(true);
  fs.writeFileSync(`${out}-${name}.png`, buf);
  const { data, info } = await sharp(buf).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).raw().toBuffer({ resolveWithObject: true });
  const lum = []; for (let i = 0; i < data.length; i += info.channels) lum.push(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length, sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  console.log(name, 'mean', mean.toFixed(1), 'stdev', sd.toFixed(2));
}
await browser.close(); server.close();
