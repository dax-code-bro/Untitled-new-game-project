// Southbound profile: CPU cost per system (ms a frame, worst frames) at four spots, draw calls, scene size.
// usage (from the repo root): PRESET=high node tools/southbound/perf-cpu.mjs > out.json
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.env.ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../site/southbound');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.addInitScript((PRESET_) => { window.SB_SKIP_INTRO = true; try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: PRESET_, dynamicRes: false, timeScale: 1 })); } catch (e) {} }, process.env.PRESET || 'high');
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.click('#play');
await page.waitForFunction(() => window.SB && window.SB.game && window.SB.state, null, { timeout: 900000, polling: 1000 });
await page.waitForTimeout(2000);
const OUT = '';
const cdp = await page.context().newCDPSession(page);
const res = await page.evaluate(async () => {
  const SB = window.SB, G = SB.game, hm = SB.debug.hm, T = SB.debug.THREE;
  SB.freeze(true); SB.skipRender(true);
  // time every update() reachable from the game object
  const acc = new Map();
  const wrap = (name, obj) => {
    if (!obj || typeof obj.update !== 'function' || obj.update.__w) return;
    const f = obj.update; const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; const r = acc.get(name) || { ms: 0, n: 0, max: 0 }; r.ms += d; r.n++; r.max = Math.max(r.max, d); acc.set(name, r); } };
    w.__w = true; obj.update = w;
  };
  for (const [k, v] of Object.entries(G)) { try { wrap(k, v); } catch (e) { /* getters */ } }
  const N = (id) => G.graph.nodes.get(id);
  const spots = { start: null, downtown: N('c3_2'), millcreek: N('t1_1'), avenue: N('c1_3') };
  const out = {};
  const sceneCounts = () => { let objs = 0, meshes = 0, vis = 0, skinned = 0, casters = 0, inst = 0, instN = 0, lights = 0; G.scene.traverse((o) => { objs++; if (o.isLight) lights++; if (o.isMesh) { meshes++; if (o.visible) vis++; if (o.isSkinnedMesh) skinned++; if (o.castShadow) casters++; if (o.isInstancedMesh) { inst++; instN += o.count; } } }); return { objs, meshes, vis, skinned, casters, inst, instN, lights }; };
  for (const [name, n] of Object.entries(spots)) {
    if (n) { SB.teleport(n.x + 6, n.z + 6, 0); }
    SB.step(90, 1 / 30); // settle: spawns, streaming
    acc.clear();
    const times = [];
    for (let i = 0; i < 150; i++) { const t = performance.now(); SB.step(1, 1 / 30); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    const sys = [...acc.entries()].map(([k, r]) => [k, +(r.ms / 150).toFixed(2), +r.max.toFixed(1)]).sort((a, b) => b[1] - a[1]).slice(0, 18);
    // one rendered frame for draw calls
    SB.skipRender(false); SB.renderNow(); const info = { calls: SB.renderer.info.render.calls, tris: SB.renderer.info.render.triangles, geos: SB.renderer.info.memory.geometries, tex: SB.renderer.info.memory.textures, progs: SB.renderer.info.programs?.length }; SB.skipRender(true);
    const mw = () => { let t = performance.now(); for (let i = 0; i < 30; i++) G.scene.updateMatrixWorld(); return +((performance.now() - t) / 30).toFixed(2); };
    const a1 = mw(); const saved = G.scene.children.map((c) => c.matrixWorldAutoUpdate); G.scene.children.forEach((c) => (c.matrixWorldAutoUpdate = true)); const a2 = mw(); G.scene.children.forEach((c, i) => (c.matrixWorldAutoUpdate = saved[i])); const a3 = mw();
    const frozen = saved.filter((x) => !x).length;
    out[name + '_mw'] = { withFreeze: a1, allOn: a2, again: a3, frozen, detail: G.detail?.stats };
    out[name] = { median: +times[75].toFixed(1), p95: +times[142].toFixed(1), max: +times[149].toFixed(1), sys, info, scene: sceneCounts(), npcs: G.peds?.count?.() ?? G.peds?.list?.length, traffic: G.traffic?.cars?.length };
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close(); server.close();
