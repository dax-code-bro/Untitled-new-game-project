// Survey shots: eye-level views around the map (one fresh page per shot).
// usage: [ROOT=<site dir>] [PRESET=low|high] [VW=1024 VH=559] [SHOTS_OUT=/tmp/shots/] node tools/southbound/view-shots.mjs <tag> <view>
// views: street main cross downtown avenue outskirts night rain yard yardhigh traffic corner gutter coasthw dunes beach field pave highway
// The owner's picture (G14): PRESET=low VW=1024 VH=559. Compare builds with ROOT pointing at a copy of the site.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire('/home/user/Untitled-new-game-project/tools/southbound/');
const { chromium } = require('playwright');
const root = process.env.ROOT || '/home/user/Untitled-new-game-project/site/southbound';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 720) } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.addInitScript((PRESET_) => { window.SB_SKIP_INTRO = true; try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: PRESET_, dynamicRes: false, timeScale: 1 })); } catch (e) {} }, process.env.PRESET || 'high');
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.click('#play');
await page.waitForFunction(() => window.SB && window.SB.game && window.SB.state, null, { timeout: 900000, polling: 1000 });
await page.waitForTimeout(2000);
const OUT = process.env.SHOTS_OUT || '/tmp/shots/'; fs.mkdirSync(OUT, { recursive: true });
const tag = process.argv[2] || 'now', which = process.argv[3] || 'street';
const cdp = await page.context().newCDPSession(page);
const info = await page.evaluate(([which, hourArg, probe, pickAt]) => {
  const SB = window.SB, G = SB.game, hm = SB.debug.hm;
  SB.freeze(true); SB.skipRender(true);
  const R = {};
  const cam = (x, y, z, tx, ty, tz) => { G.camera.position.set(x, y, z); G.camera.lookAt(tx, ty, tz); G.camera.updateMatrixWorld(); };
  document.querySelectorAll('#hud, .toast, #toast, #sbstatus').forEach((e) => (e.style.visibility = 'hidden'));
  const N = (id) => G.graph.nodes.get(id);
  // stand on the pavement beside a street from node a towards node b, looking down it
  const street = (a, b, hour, weather, side = 1, back = 10, eye = 1.7, look = 80) => {
    const A = N(a), B = N(b), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), fx = dx / L, fz = dz / L, rx = -fz, rz = fx;
    const w = (G.graph.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))?.width || 12) / 2;
    const x = A.x + fx * back + rx * (w - 1.2) * side, z = A.z + fz * back + rz * (w - 1.2) * side;
    SB.setHour(hourArg ?? hour); SB.setWeather(weather); SB.teleport(x, z, 0); SB.step(40, 1 / 30);
    const y0 = hm.height(x, z); SB.step(3, 1 / 30);
    cam(x, y0 + eye, z, x + fx * look - rx * 3 * side, y0 + eye * 0.8, z + fz * look - rz * 3 * side);
    R.at = [Math.round(x), Math.round(z)];
  };
  if (which === 'street') street('t2_0', 't2_1', 16.6, 'clear', 1, 4, 1.7, 60);
  else if (which === 'main') street('t1_1', 't2_1', 16.6, 'clear');
  else if (which === 'cross') street('t1_0', 't1_2', 16.6, 'clear', 0, -6, 2.6, 60);
  else if (which === 'downtown') street('c3_2', 'c3_4', 15.5, 'clear');
  else if (which === 'avenue') street('c1_3', 'c5_3', 17.5, 'clear', 1, 20, 1.7, 120);
  else if (which === 'outskirts') street('c4_0', 'o_n4', 16.8, 'clear');
  else if (which === 'night') street('c3_2', 'c3_4', 21.5, 'clear');
  else if (which === 'rain') street('c3_2', 'c3_4', 14, 'rain');
  else if (which === 'yard' || which === 'yardhigh') {
    // standing on one sidewalk mid-block, looking across a Mill Creek street at the houses opposite
    const A = N('t1_0'), B = N('t1_1'), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), fx = dx / L, fz = dz / L, rx = -fz, rz = fx;
    const hi = which === 'yardhigh';
    const x = A.x + fx * (hi ? 10 : 24) - rx * 4.6, z = A.z + fz * (hi ? 10 : 24) - rz * 4.6;
    SB.setHour(hourArg ?? 16.4); SB.setWeather('clear'); SB.teleport(x - rx * 8, z - rz * 8, 0); SB.step(40, 1 / 30);
    const y0 = hm.height(x, z); SB.step(3, 1 / 30);
    if (hi) cam(x, y0 + 7.5, z, x + fx * 50 + rx * 16, y0, z + fz * 50 + rz * 16);
    else cam(x, y0 + 1.75, z, x + fx * 16 + rx * 22, y0 + 1.6, z + fz * 16 + rz * 22);
    R.at = [Math.round(x), Math.round(z)];
  }
  else if (which === 'traffic') {
    // let the catalogue warm up and traffic turn over, then look down a busy avenue
    const A = N('c1_3'), B = N('c5_3'), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), fx = dx / L, fz = dz / L, rx = -fz, rz = fx;
    const x = A.x + fx * 30 + rx * 7, z = A.z + fz * 30 + rz * 7;
    SB.setHour(hourArg ?? 11); SB.setWeather('clear'); SB.teleport(x, z, 0);
    for (let i = 0; i < 40; i++) SB.step(30, 1 / 30);
    R.warm = G.carsWarming(); R.types = [...new Set(G.traffic.cars.map((c) => c.v.type))].length + ' types / ' + G.traffic.cars.length + ' cars';
    const y0 = hm.height(x, z); SB.step(2, 1 / 30);
    cam(x, y0 + 2.2, z, x + fx * 60 - rx * 4, y0 + 0.6, z + fz * 60 - rz * 4);
  }
  else if (which === 'corner') {
    // a Mill Creek crossroads from the pavement: stop signs, street names, the hydrant, the bin
    const A = N('t2_1'), x = A.x - 11, z = A.z - 9, y0 = hm.height(x, z);
    SB.setHour(hourArg ?? 16.2); SB.setWeather('clear'); SB.teleport(x - 4, z - 4, 0); SB.step(40, 1 / 30); SB.step(3, 1 / 30);
    cam(x, y0 + 1.8, z, A.x + 2, y0 + 1.2, A.z + 3);
  }
  else if (which === 'gutter') {
    // looking down a downtown gutter: drains, litter, weeds
    const A = N('c3_2'), B = N('c3_3'), x = A.x + 9.2, z = A.z + 22, y0 = hm.height(x, z);
    SB.setHour(hourArg ?? 13); SB.setWeather('clear'); SB.teleport(x + 3, z, 0); SB.step(40, 1 / 30); SB.step(3, 1 / 30);
    cam(x, y0 + 1.6, z, x - 1.5, y0 + 0.1, z + 12);
    void B;
  }
  else if (which === 'litterdown') {
    const A = N('c3_2'), x = A.x + 9.2, z = A.z + 22;
    SB.setHour(13); SB.setWeather('clear'); SB.teleport(x + 3, z, 0); SB.step(40, 1 / 30); SB.step(3, 1 / 30);
    // the nearest pavement litter: look straight down at it from 1.2 m
    let best = null, bd = 1e9; const m = new SB.THREE.Matrix4(), v = new SB.THREE.Vector3();
    for (const e of (G.clutter?.meshes || [])) if (/lit:/.test(e.im.name)) for (let i = 0; i < e.im.count; i++) { e.im.getMatrixAt(i, m); v.setFromMatrixPosition(m); const d = Math.hypot(v.x - x, v.z - z); if (d < bd && Math.abs(v.x - A.x) > 8.5) { bd = d; best = v.clone(); R.kind = e.im.name; } }
    R.litter = best && [best.x.toFixed(2), best.y.toFixed(3), best.z.toFixed(2)]; R.surface = best && G.collision.surface(best.x, best.z, best.y + 2).toFixed(3); R.terrain = best && hm.height(best.x, best.z).toFixed(3);
    if (best) cam(best.x + 0.01, best.y + 1.2, best.z + 0.6, best.x, best.y, best.z);
  }
  else if (which === 'coasthw') {
    const e = G.graph.edges.find((ed) => ed.kind === 'highway' && (ed.a === 'c0_5' || ed.b === 'c0_5'));
    const p = e.pts[8], q = e.pts[16], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz), fx = dx / L, fz = dz / L;
    const x = p[0] + fz * 3, z = p[1] - fx * 3;
    SB.setHour(hourArg ?? 17.4); SB.setWeather('clear'); SB.teleport(x, z, 0); SB.step(40, 1 / 30);
    const y0 = hm.height(x, z); SB.step(3, 1 / 30);
    cam(x, y0 + 1.7, z, x + fx * 60, y0 + 3, z + fz * 60);
    R.palms = G.palms?.count;
  }
  else if (which === 'dunes') {
    const x = -420, cz = 1480 + 90 * Math.sin(x * 0.0021 + 1.0) + 50 * Math.sin(x * 0.0057 + 2.0);
    SB.setHour(hourArg ?? 17.2); SB.setWeather('clear'); SB.teleport(x, cz - 20, 0); SB.step(40, 1 / 30);
    const y0 = Math.max(hm.height(x, cz - 20), 0); SB.step(3, 1 / 30);
    cam(x, y0 + 1.7, cz - 20, x - 60, y0 + 4, cz - 80);
    R.palms = G.palms?.count;
  }
  else if (which === 'beach') {
    const x = 420, cz = 1480 + 90 * Math.sin(x * 0.0021 + 1.0) + 50 * Math.sin(x * 0.0057 + 2.0);
    SB.setHour(hourArg ?? 17.6); SB.setWeather('clear'); SB.teleport(x, cz - 25, 0); SB.step(40, 1 / 30);
    const y0 = hm.height(x, cz - 25); SB.step(3, 1 / 30); cam(x, Math.max(y0, 0) + 1.7, cz - 25, x + 70, 1, cz + 60);
  } else if (which === 'field') {
    // the owner's field in the outskirts (from the live feed): the third-person view over a lawn
    const x = 14, z = 713;
    SB.setHour(hourArg ?? 15.6); SB.setWeather('clear'); SB.teleport(x, z, 0); SB.step(40, 1 / 30);
    const y0 = hm.height(x, z); SB.step(3, 1 / 30);
    cam(x - 4.5, y0 + 2.6, z - 4.5, x + 20, y0 + 0.2, z + 20); R.at = [x, z];
  } else if (which === 'pave') {
    // a downtown pavement at eye level, looking along it (the furniture zone by the kerb)
    const A = N('c3_2'), B = N('c3_4'), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), fx = dx / L, fz = dz / L, rx = -fz, rz = fx;
    const w = (G.graph.edges.find((e) => (e.a === 'c3_2' && e.b === 'c3_3') || (e.a === 'c3_3' && e.b === 'c3_2'))?.width || 12) / 2;
    const x = A.x + fx * 20 + rx * (w + 2.2), z = A.z + fz * 20 + rz * (w + 2.2);
    SB.setHour(hourArg ?? 15.5); SB.setWeather('clear'); SB.teleport(x, z, 0); SB.step(40, 1 / 30);
    const y0 = hm.height(x, z); SB.step(3, 1 / 30);
    cam(x, y0 + 1.7, z, x + fx * 40 - rx * 1.2, y0 + 1.0, z + fz * 40 - rz * 1.2); R.at = [Math.round(x), Math.round(z)];
    { const T = SB.THREE, m = new T.Matrix4(), v = new T.Vector3(); R.furn = {};
      G.scene.traverse((o) => { if (!o.isInstancedMesh || !/^clutter:(bench|planter|news|bikerack)$/.test(o.name)) return; let best = 1e9; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m); best = Math.min(best, Math.hypot(v.x - x, v.z - z)); } R.furn[o.name.slice(8)] = o.count + ' shown, nearest ' + best.toFixed(1) + ' m'; }); }
  } else if (which === 'highway') {
    const e = G.graph.edges.find((e) => e.kind === 'highway'); const p = e.pts[30], q = e.pts[40];
    SB.setHour(hourArg ?? 10.5); SB.setWeather('clear'); SB.teleport(p[0], p[1], 0); SB.step(40, 1 / 30);
    const y0 = hm.height(p[0], p[1]); SB.step(3, 1 / 30); cam(p[0], y0 + 1.6, p[1], q[0] * 3 - p[0] * 2, y0 + 1, q[1] * 3 - p[1] * 2);
  }
  G.sky.refreshClouds?.();
  if (probe === 'pick') {
    const T = SB.THREE, rc = new T.Raycaster(); const [pxX, pxY] = (pickAt || '1110,680').split(',').map(Number); rc.setFromCamera(new T.Vector2(pxX / (innerWidth / 2) - 1, -(pxY / (innerHeight / 2) - 1)), G.camera);
    const hits = rc.intersectObjects(G.scene.children, true).slice(0, 4);
    R.pick = hits.map((h) => { let o = h.object, chain = []; for (let q = o; q && chain.length < 5; q = q.parent) chain.push((q.name || q.type) + (q.userData?.kind ? '#' + q.userData.kind : '')); const m = Array.isArray(o.material) ? o.material[0] : o.material; return { d: +h.distance.toFixed(2), p: [h.point.x.toFixed(2), h.point.y.toFixed(3), h.point.z.toFixed(2)], chain, mat: m?.type, col: m?.color?.getHexString(), map: m?.map?.image ? [m.map.image.width, m.map.image.height, m.map.name || m.map.image.src?.slice(-40)] : null, ud: JSON.stringify(o.userData).slice(0, 120), inst: o.isInstancedMesh ? o.count : 0, geo: o.geometry?.type }; });
  }
  if (probe === 'grate') {
    const T = SB.THREE; G.scene.traverse((o) => { if (o.name === 'clutter:grate') { const mt = o.material; R.grate = { type: mt.type, col: mt.color.getHexString(), rough: mt.roughness, metal: mt.metalness, map: mt.map && [mt.map.image.width, mt.map.image.height], obc: String(mt.onBeforeCompile).slice(0, 200), env: !!mt.envMap, envI: mt.envMapIntensity, cnt: o.count, vc: mt.vertexColors, ic: !!o.instanceColor }; const m = new T.Matrix4(), v = new T.Vector3(); o.getMatrixAt(0, m); v.setFromMatrixPosition(m); R.grate.p0 = [v.x.toFixed(1), v.y.toFixed(3), v.z.toFixed(1)]; o.material = new T.MeshBasicMaterial({ map: mt.map }); } });
    R.sceneEnv = !!G.scene.environment; R.envI = G.scene.environmentIntensity;
  }
  if (probe && probe !== 'grate' && probe !== 'pick') {
    const T = SB.THREE, m = new T.Matrix4(), v = new T.Vector3(), P = G.camera.position, fwd = new T.Vector3(); G.camera.getWorldDirection(fwd);
    const rows = [];
    G.scene.traverse((o) => {
      if (!o.isInstancedMesh || !/^clutter:(lit|stain)/.test(o.name)) return;
      let near = 0, front = 0, best = 1e9, ys = [];
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m); const d = v.distanceTo(P); best = Math.min(best, d); if (d < 25) { near++; if (v.clone().sub(P).dot(fwd) > 0) { front++; if (ys.length < 2) ys.push([v.x.toFixed(1), v.y.toFixed(3), v.z.toFixed(1), G.collision.surface(v.x, v.z, v.y + 2).toFixed(3)]); } } }
      rows.push(o.name.slice(8) + ' vis=' + o.visible + ' cnt=' + o.count + ' near=' + near + ' front=' + front + ' best=' + best.toFixed(1) + ' ' + JSON.stringify(ys) + ' layers=' + o.layers.mask + ' parent=' + (o.parent?.type));
      if (probe === 'magenta') o.material = new T.MeshBasicMaterial({ color: 0xff00ff, depthTest: false });
      if (probe === 'stainblack' && o.name === 'clutter:stain') { const mm = o.material.clone(); mm.map = null; mm.color.set(0x000000); mm.opacity = 0.6; o.material = mm; R.stainMat = { t: mm.transparent, dw: mm.depthWrite, op: mm.opacity, at: mm.alphaTest, bl: mm.blending, pre: !!o.material.onBeforeCompile }; }
      if (probe === 'stainblack' && o.name === 'clutter:stain') { const img = o.material.map; }
      if (probe === 'stainmap' && o.name === 'clutter:stain') { const t = o.material.map, c = t.image, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let mx = 0, sum = 0; for (let i = 3; i < d.length; i += 4) { mx = Math.max(mx, d[i]); sum += d[i]; } R.stainAlpha = { mx, mean: sum / (d.length / 4), fmt: t.format, pre: t.premultiplyAlpha, cs: t.colorSpace, rgb: [d[64 * 512 + 256], d[64 * 512 + 257], d[64 * 512 + 259]] }; }
      if (probe === 'magentad') { const mm = o.material.clone(); mm.map = null; mm.color.set(0xff00ff); mm.emissive?.set(0xff00ff); mm.opacity = 1; mm.transparent = false; o.material = mm; }
    });
    R.probe = rows;
  }
  SB.skipRender(false); SB.renderNow(); SB.renderNow();
  R.clutter = (G.clutter?.meshes || []).filter((e) => /lit:|weed/.test(e.im.name)).map((e) => e.im.name.slice(8) + ':' + e.shown + '/' + e.total).join(' ');
  { const P = G.camera.position; let best = 1e9; for (const e of (G.clutter?.meshes || [])) if (/lit:/.test(e.im.name)) { const m = new SB.THREE.Matrix4(), v = new SB.THREE.Vector3(); for (let i = 0; i < e.im.count; i++) { e.im.getMatrixAt(i, m); v.setFromMatrixPosition(m); best = Math.min(best, v.distanceTo(P)); } } R.nearestLitter = +best.toFixed(1); }
  R.yards = G.yards?.counts; R.kerb = G.kerbside ? [G.kerbside.slots?.(), G.kerbside.live?.()] : null;
  R.info = SB.debug.renderer?.info ? { calls: SB.debug.renderer.info.render.calls, tris: SB.debug.renderer.info.render.triangles } : null;
  return R;
}, [which, process.env.HOUR ? +process.env.HOUR : null, process.env.PROBE || '', process.env.PICK || '']);
await page.waitForTimeout(400);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${OUT}${tag}-${which}.png`, Buffer.from(data, 'base64'));
console.log(which, JSON.stringify(info));
await browser.close(); server.close();
