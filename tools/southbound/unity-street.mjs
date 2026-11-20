// The `street` step of export-unity.mjs: everything on Calvera's streets that the other steps don't carry
// (sidewalks and kerbs, intersections, the city blocks' concrete, bridges, street lights, utility poles and
// their wires, palms, front yards, chain-link fences, gutters, rooftop units, storefronts, shop and street
// signs, billboards, wayfinding signs, benches, hydrants, bins, drains, litter, weeds...).
//
// It runs the web game headless from an instrumented copy of the bundle (the shipped game.js is not
// touched): an esbuild plugin wraps every `new THREE.Mesh/InstancedMesh/Line...` in src/world/*.js so each
// object knows where it was made (`file:variable`, or `file:line`), and names each surface texture as it
// loads. Systems that draw only what's near the camera (core/nearinst.js) hand over every instance as the
// camera visits each 150 m square the roads run through. The result is geometry, materials, textures and
// instance transforms in the web game's space (Data/World/calvera-street.json + street-tex/*.png); the
// Unity side (Core/StreetData.cs, Editor/StreetBuilder.cs) mirrors it into the scene.
// Every walk-in building made by systems/gunstores.js buildShop (gun stores, clothing stores, Gulf Marts, armour
// shops, the auction house, the police station and the hospital) comes whole, inside and out, with its doors
// propped open, and Data/World/calvera-shops.json says what each one is (keeper, counter, prices, the door).
// The story missions, the side jobs, the named places they send you (snapped to roads as the game does), the
// job boards where they ended up and the town layout the jobs' stops are drawn from go to calvera-missions.json.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

// what to carry: by module, minus what Unity builds its own way (road ribbons, building boxes, gable
// roofs, the facade pieces, trees and grass) and what HDRP does better itself (light pools, beams, contact shadows)
const MODULES = ['roads.js', 'buildings.js', 'yards.js', 'powerlines.js', 'palms.js', 'streetclutter.js', 'storefronts.js', 'billboards.js', 'wayfinding.js', 'hilltop.js', 'facades.js', 'shoulders.js'];
const SKIP = [/^roads\.js:(hwMesh|stMesh|ctMesh|gvMesh|pools)$/, /^buildings\.js:(roofMesh)$/];
const KEEP_NAMED = { 'facades.js': /^facade-signs$/, 'buildings.js': /^(?!buildings-)/ };

export async function exportStreet({ repo, game, unity }) {
  const require = createRequire(path.join(repo, 'tools/southbound/package.json'));
  const { build } = require('esbuild');
  const three = path.join(game, 'vendor/three');
  const threeResolver = { name: 'three', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(three, 'build/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(three, 'addons', a.path.slice('three/addons/'.length)) }));
    b.onResolve({ filter: /^three\/examples\/jsm\// }, (a) => ({ path: path.join(three, 'addons', a.path.slice('three/examples/jsm/'.length)) }));
    b.onResolve({ filter: /^postprocessing$/ }, () => ({ path: path.join(game, 'vendor/postprocessing/index.js') }));
    b.onResolve({ filter: /^n8ao$/ }, () => ({ path: path.join(game, 'vendor/n8ao/N8AO.js') }));
    b.onResolve({ filter: /^three-mesh-bvh$/ }, () => ({ path: path.join(game, 'vendor/three-mesh-bvh/index.module.js') }));
  } };
  const tagger = { name: 'sbtag', setup(b) {
    b.onLoad({ filter: /src[\\/]world[\\/][^\\/]+\.js$/ }, async (a) => {
      const file = path.basename(a.path);
      const src = (await fs.promises.readFile(a.path, 'utf8')).split('\n').map((l, i) => {
        const named = /(?:const|let|var)\s+(\w+)\s*=\s*new THREE\.(InstancedMesh|Mesh|LineSegments|Line|Points)\(/.exec(l);
        return l.replace(/new THREE\.(InstancedMesh|Mesh|LineSegments|Line|Points)\(/g, (m, cls) => `new (__sbClass(THREE.${cls}, '${file}:${named && named[2] === cls ? named[1] : i + 1}'))(`);
      }).join('\n');
      return { contents: src, loader: 'js' };
    });
    // every walk-in shop building, remembered as it's made (exported whole, and listed in calvera-shops.json)
    b.onLoad({ filter: /src[\\/]systems[\\/]gunstores\.js$/ }, async (a) => {
      const src = (await fs.promises.readFile(a.path, 'utf8')).replace('return { g, y, keeper, keeperFace: g.rotation.y,', '(globalThis.__sbShops = globalThis.__sbShops || []).push({ g, st, keeper, doorAt }); return { g, y, keeper, keeperFace: g.rotation.y,');
      if (!src.includes('__sbShops')) throw new Error('street: buildShop changed; update the shop hook in unity-street.mjs');
      return { contents: src, loader: 'js' };
    });
    // the missions, side jobs and jobs, with the places the game worked out for them
    const hook = (rx, edits) => b.onLoad({ filter: rx }, async (a) => {
      let src = await fs.promises.readFile(a.path, 'utf8');
      for (const [from, to] of edits) { if (!src.includes(from)) throw new Error(`street: ${path.basename(a.path)} changed; update the hook in unity-street.mjs (${from.slice(0, 40)})`); src = src.replace(from, to); }
      return { contents: src, loader: 'js' };
    });
    hook(/src[\\/]systems[\\/]missions\.js$/, [['  // armed mission enemies: close in and shoot at the player', '  globalThis.__sbPlaces = places;\n  // armed mission enemies: close in and shoot at the player'],
      ['export function installMissions(game) {', 'globalThis.__sbMissions = MISSIONS;\nexport function installMissions(game) {']]);
    hook(/src[\\/]systems[\\/]missionsplus\.js$/, [['const sideMissions = SIDE.map(', 'const sideMissions = globalThis.__sbSide = SIDE.map(']]);
    hook(/src[\\/]systems[\\/]jobs\.js$/, [['  for (const def of JOBS) {\n    const at = where(def);', '  globalThis.__sbLayout = { CITY, TOWN, LAKE, PLAINS, FOREST, AIRFIELD, BAYOU };\n  for (const def of JOBS) {\n    const at = where(def); (globalThis.__sbJobs = globalThis.__sbJobs || []).push({ ...def, at: [at[0], at[1]], board: undefined });']]);
    // surface textures carry their set's name (the KTX2 loader leaves them nameless)
    b.onLoad({ filter: /src[\\/]assets[\\/]textures\.js$/ }, async (a) => {
      const src = (await fs.promises.readFile(a.path, 'utf8')).replace('out[key][k] = t;', 'out[key][k] = t; t.name = name + "|" + k;');
      return { contents: src, loader: 'js' };
    });
  } };
  const banner = 'globalThis.__sbClass = (function(){ var cache = {}; return function(C, t){ var k = C.name + "|" + t; if (cache[k]) return cache[k]; var X = class extends C { constructor(...a){ super(...a); this.__sbTag = t; } }; cache[k] = X; return X; }; })();';
  const r = await build({ entryPoints: [path.join(game, 'src/main.js')], bundle: true, format: 'iife', target: ['es2020'], minify: false, write: false, plugins: [threeResolver, tagger], banner: { js: banner }, logLevel: 'error' });
  const bundle = r.outputFiles[0].text;

  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/game.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(bundle); }
    const p = path.join(game, u.replace(/\/$/, '/index.html'));
    if (!p.startsWith(game) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((ok) => server.listen(0, ok));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (q) => q.abort());
  await page.addInitScript(() => { window.SB_SKIP_INTRO = true; try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: 'high', dynamicRes: false, timeScale: 0 })); } catch (e) { /* private mode */ } });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.click('#play');
  console.log('street: generating Calvera in headless Chromium from an instrumented bundle (a few minutes)...');
  await page.waitForFunction(() => window.SB && window.SB.game && window.SB.game.city, null, { timeout: 900000, polling: 1000 });
  await page.waitForTimeout(3000);

  const data = await page.evaluate(({ MODULES, SKIP, KEEP_NAMED }) => {
    const skip = SKIP.map((s) => new RegExp(s.slice(1, s.lastIndexOf('/'))));
    const keepNamed = Object.fromEntries(Object.entries(KEEP_NAMED).map(([k, s]) => [k, new RegExp(s.slice(1, s.lastIndexOf('/')))]));
    const G = window.SB.game, SB = window.SB;
    SB.freeze(true); SB.skipRender(true);
    // the shop buildings, whole (their own parts and everything put in them: counters, racks, the guns on the wall)
    const shopParts = new Set();
    for (const s of window.__sbShops || []) s.g.traverse((o) => { if (o.isMesh || o.isInstancedMesh) { shopParts.add(o); if (!o.__sbTag) o.__sbTag = 'shops.js:' + (s.st.id || 'shop'); } });
    const wanted = (o) => {
      if (shopParts.has(o)) { const ms = Array.isArray(o.material) ? o.material : [o.material]; return !ms.some((m) => !m || m.isShaderMaterial); }
      const t = o.__sbTag; if (!t) return false;
      const file = t.split(':')[0];
      if (!MODULES.includes(file)) return false;
      if (skip.some((rx) => rx.test(t))) return false;
      if (keepNamed[file] && !keepNamed[file].test(o.name || '')) return false;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m) => !m || m.isShaderMaterial)) return false;
      return true;
    };
    // every instance each object ever shows, as the camera visits each 150 m square with a road in it
    const objs = new Map();
    const grab = () => G.scene.traverse((o) => {
      if (!wanted(o)) return;
      let e = objs.get(o);
      if (!e) objs.set(o, (e = { inst: new Map() }));
      if (!o.isInstancedMesh) return;
      const a = o.instanceMatrix.array, c = o.instanceColor ? o.instanceColor.array : null;
      for (let i = 0; i < o.count; i++) {
        const k = [12, 13, 14, 0, 2, 5, 8].map((j) => Math.round(a[i * 16 + j] * 1000)).join(',');
        if (!e.inst.has(k)) e.inst.set(k, [Array.from(a.subarray(i * 16, i * 16 + 16)), c ? Array.from(c.subarray(i * 3, i * 3 + 3)) : null]);
      }
    });
    const stops = new Map();
    for (const e of G.graph.edges) for (const p of e.pts) {
      const x = Array.isArray(p) ? p[0] : p.x, z = Array.isArray(p) ? p[1] : p.z, k = Math.floor(x / 150) + ',' + Math.floor(z / 150);
      if (!stops.has(k)) stops.set(k, [x, z]);
    }
    grab();
    for (const [, [x, z]] of stops) { SB.teleport(x, z); SB.step(1, 1 / 30); grab(); }

    // the shop doors stand open (Unity bakes the street's pieces in place)
    for (const d of G.shopDoors || []) for (const l of d.leaves || []) { l.pivot.rotation.y = l.s * 1.35; l.pivot.updateMatrixWorld(true); }

    const b64 = (ta) => { const u8 = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const out = { geometries: [], materials: [], textures: [], objects: [], lines: [], stops: stops.size };
    const geoId = new Map(), matId = new Map(), texId = new Map();
    const tex = (t) => {
      if (!t) return null;
      if (texId.has(t)) return texId.get(t);
      let rec = null;
      if (t.name && t.name.includes('|')) rec = { surf: t.name.split('|')[0], slot: t.name.split('|')[1] };
      else if (t.image && (t.image.width || t.image.videoWidth)) {
        try {
          const img = t.image, cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          cv.getContext('2d').drawImage(img, 0, 0);
          rec = { png: cv.toDataURL('image/png'), w: img.width, h: img.height, repeat: t.wrapS === 1000, flipY: !!t.flipY };
        } catch (e) { rec = null; }
      }
      const id = rec ? out.textures.push(rec) - 1 : null;
      texId.set(t, id);
      return id;
    };
    const lin = (c) => (c ? [c.r, c.g, c.b] : null);
    const mat = (m) => {
      if (matId.has(m)) return matId.get(m);
      const rec = {
        type: m.type, color: lin(m.color), rough: m.roughness ?? 1, metal: m.metalness ?? 0,
        emissive: lin(m.emissive), emissiveIntensity: m.emissiveIntensity ?? 0,
        map: tex(m.map), transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0,
        doubleSided: m.side === 2, vertexColors: !!m.vertexColors, custom: !!m.onBeforeCompile && m.onBeforeCompile.toString().length > 20,
        surf: m.userData && m.userData.surf || null,
      };
      const id = out.materials.push(rec) - 1;
      matId.set(m, id);
      return id;
    };
    const geo = (g) => {
      if (geoId.has(g)) return geoId.get(g);
      const A = g.attributes, rec = { pos: b64(new Float32Array(A.position.array)), n: A.position.count };
      if (A.normal) rec.nrm = b64(new Float32Array(A.normal.array));
      if (A.uv) rec.uv = b64(new Float32Array(A.uv.array));
      if (A.color) rec.col = b64(new Float32Array(A.color.array)), rec.colSize = A.color.itemSize;
      if (g.index) rec.idx = b64(new Uint32Array(g.index.array));
      if (g.groups && g.groups.length) rec.groups = g.groups.map((q) => [q.start, q.count, q.materialIndex ?? 0]);
      const id = out.geometries.push(rec) - 1;
      geoId.set(g, id);
      return id;
    };
    for (const [o, e] of objs) {
      o.updateMatrixWorld(true);
      if (o.isLine || o.isPoints) {
        if (o.isPoints) continue;
        const p = o.geometry.attributes.position, w = new Float32Array(p.count * 3), v = { x: 0, y: 0, z: 0 };
        const M = o.matrixWorld.elements;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          w[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; w[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; w[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
        }
        const idx = o.geometry.index ? Array.from(o.geometry.index.array) : null;
        out.lines.push({ tag: o.__sbTag, segments: !!o.isLineSegments, pos: b64(w), idx: idx ? b64(new Uint32Array(idx)) : null, color: lin(o.material.color) });
        continue;
      }
      const ms = Array.isArray(o.material) ? o.material.map(mat) : [mat(o.material)];
      const rec = { tag: o.__sbTag, name: o.name || '', geo: geo(o.geometry), mats: ms, world: Array.from(o.matrixWorld.elements), shadows: !!o.castShadow };
      if (o.isInstancedMesh) {
        const list = [...e.inst.values()];
        if (!list.length) continue;
        rec.inst = b64(new Float32Array(list.flatMap((q) => q[0])));
        if (list[0][1]) rec.colors = b64(new Float32Array(list.flatMap((q) => q[1] || [1, 1, 1])));
        rec.count = list.length;
      }
      out.objects.push(rec);
    }
    // what each shop is: who keeps it, where the counter and the door are, prices; the civic buildings
    const keeperOf = new Map((G.storeKeepers || []).map((k) => [k.st, k]));
    out.shops = (window.__sbShops || []).map((s) => {
      const k = keeperOf.get(s.st), st = s.st;
      return { id: st.id || '', name: st.name || '', kind: k ? k.kind : (st.id || 'building'), keeper: st.keeper || '', blurb: st.blurb || '', priceK: st.priceK || 1,
        look: (st.look && st.look.base) || '', lines: (st.look && st.look.lines) || [], hours: st.hours || '',
        keeperAt: [s.keeper.x, s.keeper.y, s.keeper.z], face: s.g.rotation.y, door: [s.doorAt.x, s.doorAt.z], y: s.g.position.y, at: [s.g.position.x, s.g.position.z] };
    });
    const plain = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v)));
    out.missions = {
      story: (window.__sbMissions || []).map((m) => ({ id: m.id, act: m.act, who: m.who, title: m.title, brief: m.brief, steps: m.steps, reward: m.reward })),
      side: (window.__sbSide || []).map((m) => ({ id: m.id, who: m.who, title: m.title, brief: m.brief, steps: m.steps, reward: m.reward, need: m.need ?? null })),
      places: window.__sbPlaces || {}, jobs: plain(window.__sbJobs || []), layout: plain(window.__sbLayout || {}),
    };
    return out;
  }, { MODULES, SKIP: SKIP.map(String), KEEP_NAMED: Object.fromEntries(Object.entries(KEEP_NAMED).map(([k, v]) => [k, String(v)])) });
  await browser.close();
  server.close();

  const outDir = path.join(unity, 'Data/World'), texDir = path.join(outDir, 'street-tex');
  fs.rmSync(texDir, { recursive: true, force: true });
  fs.mkdirSync(texDir, { recursive: true });
  data.textures.forEach((t, i) => {
    if (!t.png) return;
    fs.writeFileSync(path.join(texDir, `t${i}.png`), Buffer.from(t.png.split(',')[1], 'base64'));
    t.file = `street-tex/t${i}.png`; delete t.png;
  });
  fs.writeFileSync(path.join(outDir, 'calvera-shops.json'), JSON.stringify({ shops: data.shops }, null, 1));
  console.log(`street: ${data.shops.length} walk-in buildings (${data.shops.map((s) => s.id).join(', ')})`);
  delete data.shops;
  fs.writeFileSync(path.join(outDir, 'calvera-missions.json'), JSON.stringify(data.missions, null, 1));
  console.log(`street: ${data.missions.story.length} story missions, ${data.missions.side.length} side jobs, ${data.missions.jobs.length} jobs, ${Object.keys(data.missions.places).length} places`);
  delete data.missions;
  fs.writeFileSync(path.join(outDir, 'calvera-street.json'), JSON.stringify(data));
  const inst = data.objects.reduce((s, o) => s + (o.count || 1), 0);
  const byFile = {};
  for (const o of data.objects) { const f = o.tag.split(':')[0]; byFile[f] = (byFile[f] || 0) + (o.count || 1); }
  console.log(`street: ${data.objects.length} objects (${inst} placed), ${data.lines.length} wire sets, ${data.geometries.length} shapes, ${data.materials.length} materials, ${data.textures.length} textures over ${data.stops} stops`);
  console.log('street: ' + Object.entries(byFile).map(([f, n]) => `${f.replace('.js', '')} ${n}`).join(', '));
}
