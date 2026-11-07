// Southbound profile: draw calls split by render pass and by what is drawn (people, cars, props, shadows).
// usage (from the repo root): PRESET=high node tools/southbound/perf-draws.mjs > out.json
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
const res = await page.evaluate(async () => {
  const SB = window.SB, G = SB.game, R = SB.renderer, scene = G.scene;
  SB.freeze(true); SB.skipRender(true);
  const N = (id) => G.graph.nodes.get(id);
  const out = {};
  // which pass is drawing: wrap render() to label by camera/target
  let pass = 'main';
  const origRender = R.render.bind(R);
  const passes = new Map();
  R.render = function (sc, cam) {
    const prev = pass;
    const rt = R.getRenderTarget();
    pass = (sc !== scene ? 'other:' + (sc.type || '') : '') + (cam.isCubeCamera || cam.parent?.isCubeCamera ? 'cube' : cam.isOrthographicCamera ? 'ortho' : 'persp') + (rt ? ':rt' + (rt.width + 'x' + rt.height) : ':screen');
    const c0 = R.info.render.calls;
    const r = origRender(sc, cam);
    const p = passes.get(pass) || { calls: 0, n: 0, who: [] }; p.calls += R.info.render.calls - c0; p.n++; if (/persp/.test(pass) && sc === scene) p.who.push((R.info.render.calls - c0) + ' <- ' + (new Error().stack.split('\n').slice(2, 6).map((l) => l.trim().split(' ')[1]).join(' < '))); passes.set(pass, p);
    pass = prev; return r;
  };
  // what is drawn: by top-level group (child of the scene) and by shadow vs colour
  const by = new Map();
  const origRBD = R.renderBufferDirect.bind(R);
  R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    let top = object; while (top.parent && top.parent !== scene) top = top.parent;
    const shadow = material.isMeshDepthMaterial || material.isMeshDistanceMaterial || material.type === 'MeshDepthMaterial' || camera.isOrthographicCamera && R.getRenderTarget()?.depthTexture === undefined && R.getRenderTarget() && /shadow/i.test(R.getRenderTarget().texture?.name || '');
    let tag = top.name || top.type; if (!top.name && top.userData.__cat) tag = top.userData.__cat; else if (!top.name) { const ud = Object.keys(top.userData || {}).slice(0, 3).join(','); tag = top.type + '{' + ud + '}' + (top.children[0]?.name ? '/' + top.children[0].name : ''); }
    const key = (material.isMeshDepthMaterial || material.isMeshDistanceMaterial ? 'SHADOW ' : '') + tag + (object.isSkinnedMesh ? '[skinned]' : object.isInstancedMesh ? '[inst]' : '');
    const idx = geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0;
    const tri = (object.isInstancedMesh ? object.count : 1) * idx / 3;
    const b = by.get(key) || { calls: 0, tris: 0 }; b.calls++; b.tris += tri; by.set(key, b);
    return origRBD(camera, sc, geometry, material, object, group);
  };
  const spots = { downtown: N('c3_2'), millcreek: N('t1_1') };
  for (const [name, n] of Object.entries(spots)) {
    SB.teleport(n.x + 6, n.z + 6, 0); SB.step(90, 1 / 30);
    passes.clear(); by.clear();
    const cam = G.camera.position, hist = {};
    for (const c of scene.children) {
      if (c.name || c.type !== 'Group') continue;
      let skinned = 0, meshes = 0, door = false; c.traverse((o) => { if (o.isSkinnedMesh) skinned++; if (o.isMesh) meshes++; if (/door-drv|wheel/i.test(o.name)) door = true; });
      const cat = skinned ? 'PERSON' : door ? 'VEHICLE' : 'OTHER/' + (c.children.slice(0, 2).map((k) => k.name || k.type).join('+'));
      c.userData.__cat = cat;
      const d = c.position.distanceTo(cam), band = d < 30 ? '<30' : d < 60 ? '<60' : d < 120 ? '<120' : d < 250 ? '<250' : '250+';
      const k = cat.split('/')[0] + (c.visible ? '' : '(hidden)') + ' ' + band; hist[k] = (hist[k] || 0) + 1;
      if (!hist['meshes ' + cat.split('/')[0]]) hist['meshes ' + cat.split('/')[0]] = 0; hist['meshes ' + cat.split('/')[0]] += meshes;
    }
    out[name + '_hist'] = hist;
    SB.skipRender(false); R.info.reset(); R.info.autoReset = false; SB.renderNow(); const total = R.info.render.calls; R.info.autoReset = true; SB.skipRender(true);
    let t = performance.now(); for (let i = 0; i < 20; i++) scene.updateMatrixWorld(); const mw = (performance.now() - t) / 20;
    let auto = 0, all = 0; scene.traverse((o) => { all++; if (o.matrixAutoUpdate) auto++; });
    const roots = new Map(); for (const c of scene.children) { let n = 0, bones = 0; c.traverse((o) => { n++; if (o.isBone) bones++; }); const tag = c.name || (c.type + '{' + Object.keys(c.userData || {}).slice(0, 3).join(',') + '}' + (c.children[0]?.name ? '/' + c.children[0].name : '')); const r = roots.get(tag) || { roots: 0, objs: 0, bones: 0 }; r.roots++; r.objs += n; r.bones += bones; roots.set(tag, r); }
    out[name + '_roots'] = [...roots.entries()].sort((a, b) => b[1].objs - a[1].objs).slice(0, 25).map(([k, v]) => k + ' roots=' + v.roots + ' objs=' + v.objs + ' bones=' + v.bones);
    out[name] = { total, passes: [...passes.entries()].filter(([k]) => /persp/.test(k)).map(([k, v]) => k + ' x' + v.n + ' calls=' + v.calls + ' ' + v.who.join(' | ')), top: [...by.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, 30).map(([k, v]) => k + ' c=' + v.calls + ' t=' + Math.round(v.tris / 1000) + 'k'), topTris: [...by.entries()].sort((a, b) => b[1].tris - a[1].tris).slice(0, 12).map(([k, v]) => k + ' t=' + Math.round(v.tris / 1000) + 'k c=' + v.calls), matrixWorldMs: +mw.toFixed(2), autoUpdate: auto, objects: all, shadowMap: { on: R.shadowMap.enabled, type: R.shadowMap.type, autoUpdate: R.shadowMap.autoUpdate } };
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close(); server.close();
