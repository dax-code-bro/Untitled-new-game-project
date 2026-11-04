// Exports Southbound's art and data into the Unity project (southbound-unity/).
//
//   node tools/southbound/export-unity.mjs [textures] [models] [catalog] [world]
//
// With no arguments it runs every step.
//
// textures  assets/textures/*.ktx2 -> Assets/Southbound/Art/Surfaces/<Set>/
//           BaseColor (JPG), Normal (PNG, OpenGL +Y), Mask (PNG: R metal, G AO,
//           B detail mask, A smoothness = 1 - roughness, the HDRP Lit layout),
//           Height (PNG), Emission (JPG), TerrainMask (the mask with height in B,
//           for HDRP terrain layers), plus surface.json (tile size in metres).
// models    assets/{people,anims,veg,open}/**.glb -> Assets/Southbound/Art/Models/
//           Meshopt is decoded and WebP textures become PNG/JPG, so glTFast
//           imports them with no extra packages.
// catalog   the weapon + attachment catalog as JSON, the fixture the C# port
//           is tested against (Tools/CoreTests/fixtures/catalog.json).
// world     runs the web game headless and dumps Calvera: terrain heights,
//           ground splat, water, roads, buildings, roofs and trees
//           (southbound-unity/Data/World/).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const game = path.join(repo, 'site/southbound');
const unity = path.join(repo, 'southbound-unity');
const art = path.join(unity, 'Assets/Southbound/Art');
const steps = process.argv.slice(2);
const want = (s) => steps.length === 0 || steps.includes(s);
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- KTX2 decode
let basis = null;
async function basisModule() {
  if (basis) return basis;
  const dir = path.join(game, 'vendor/three/addons/libs/basis');
  const BASIS = require(path.join(dir, 'basis_transcoder.js'));
  basis = await BASIS({ wasmBinary: fs.readFileSync(path.join(dir, 'basis_transcoder.wasm')) });
  basis.initializeBasis();
  return basis;
}
// -> { width, height, data: RGBA Uint8Array } (row 0 = top of the image, as authored)
async function decodeKTX2(file) {
  const B = await basisModule();
  const f = new B.KTX2File(new Uint8Array(fs.readFileSync(file)));
  try {
    if (!f.isValid()) throw new Error(`invalid KTX2 ${file}`);
    const width = f.getWidth(), height = f.getHeight();
    if (!f.startTranscoding()) throw new Error(`startTranscoding failed ${file}`);
    const RGBA32 = 13; // basist::transcoder_texture_format::cTFRGBA32
    const size = f.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32);
    const data = new Uint8Array(size);
    if (!f.transcodeImage(data, 0, 0, 0, RGBA32, 0, -1, -1)) throw new Error(`transcode failed ${file}`);
    return { width, height, data };
  } finally { f.close(); f.delete(); }
}

// ---------------------------------------------------------------- textures
// tile sizes come from the web game's SURF table, so materials keep their scale
const SIZES = {
  Grass004: 2.4, Ground037: 3.0, forest_ground_04: 3.0, coast_sand_01: 3.0, Rock030: 6.0, asphalt_02: 4.0,
  Concrete034: 2.5, brick_wall_10: 2.5, plastered_wall_03: 3.0, Facade002: 15.0, Facade014: 80.0, Facade012: 30.0,
  Asphalt012: 3.2, square_concrete_pavers: 2.4, Cobblestone01: 1.6, red_brick: 2.2, StuccoWall01: 2.6,
  weathered_plank_siding: 2.4, RoofingTiles013A: 2.6, CorrugatedSteel005: 2.2, RustyCorrugatedMetalPanel01: 2.2,
  brown_mud: 3.0, forest_leaves_02: 2.6, Dirt01: 2.2, Gravel004: 1.6, cliff_side: 7.0, WoodFloor007: 2.0,
  BathroomTiles02: 1.5, Ground068: 3.0,
};
// where each set came from (CC0), so the Unity editor can fetch the 2K/4K originals
// the sets the Unity terrain paints with (CalveraBuilder.BuildTerrain)
const TERRAIN = new Set(['Grass004', 'Ground037', 'coast_sand_01', 'forest_ground_04', 'Concrete034', 'cliff_side']);
const CGBOOKCASE = new Set(['Cobblestone01', 'StuccoWall01', 'RustyCorrugatedMetalPanel01', 'Dirt01', 'BathroomTiles02']);
const SOURCE = (name) => (CGBOOKCASE.has(name) ? 'cgbookcase' : /^[A-Z]/.test(name) ? 'ambientcg' : 'polyhaven');

async function exportTextures() {
  const src = path.join(game, 'assets/textures');
  const sets = new Map();
  for (const f of fs.readdirSync(src)) {
    const m = f.match(/^(.*)_(color|normal|rough|height|ao|metal|emit)\.ktx2$/);
    if (!m) continue;
    if (!sets.has(m[1])) sets.set(m[1], {});
    sets.get(m[1])[m[2]] = path.join(src, f);
  }
  const outRoot = path.join(art, 'Surfaces');
  mkdir(outRoot);
  const index = [];
  let bytes = 0;
  for (const [name, maps] of [...sets].sort()) {
    const dir = path.join(outRoot, name);
    mkdir(dir);
    const img = {};
    for (const [k, f] of Object.entries(maps)) img[k] = await decodeKTX2(f);
    const { width, height } = img.color;
    const raw = (d, ch = 4) => sharp(Buffer.from(d.buffer, d.byteOffset, d.byteLength), { raw: { width, height, channels: ch } });
    const same = (k) => img[k] && img[k].width === width && img[k].height === height;
    const files = {};
    const write = async (file, pipeline) => { const p = path.join(dir, file); await pipeline.toFile(p); bytes += fs.statSync(p).size; files[file.replace(/^.*_(\w+)\.\w+$/, '$1')] = file; };

    await write(`${name}_BaseColor.jpg`, raw(img.color.data).removeAlpha().jpeg({ quality: 92, chromaSubsampling: '4:4:4' }));
    if (same('normal')) await write(`${name}_Normal.png`, raw(img.normal.data).removeAlpha().png({ compressionLevel: 9 }));
    // HDRP mask: R metallic, G ambient occlusion, B detail mask, A smoothness
    const n = width * height, mask = new Uint8Array(n * 4);
    const R = same('rough') ? img.rough.data : null, A = same('ao') ? img.ao.data : null, M = same('metal') ? img.metal.data : null;
    for (let i = 0; i < n; i++) {
      mask[i * 4] = M ? M[i * 4] : 0;
      mask[i * 4 + 1] = A ? A[i * 4] : 255;
      mask[i * 4 + 2] = 255;
      mask[i * 4 + 3] = R ? 255 - R[i * 4] : 30; // no roughness map: fairly rough (0.88)
    }
    await write(`${name}_Mask.png`, raw(mask).png({ compressionLevel: 9 }));
    // HDRP terrain layers read height from the mask's blue channel (height-based blending)
    if (same('height') && TERRAIN.has(name)) {
      const H = img.height.data, tmask = Uint8Array.from(mask);
      for (let i = 0; i < n; i++) tmask[i * 4 + 2] = H[i * 4];
      await write(`${name}_TerrainMask.png`, raw(tmask).png({ compressionLevel: 9 }));
    }
    if (same('height')) await write(`${name}_Height.png`, raw(img.height.data).extractChannel(0).png({ compressionLevel: 9 }));
    if (same('emit')) await write(`${name}_Emission.jpg`, raw(img.emit.data).removeAlpha().jpeg({ quality: 90 }));
    const meta = { name, source: SOURCE(name), tileMeters: SIZES[name] || 3, size: width, maps: Object.keys(maps).sort(), files };
    fs.writeFileSync(path.join(dir, 'surface.json'), JSON.stringify(meta, null, 2) + '\n');
    index.push(meta);
    console.log(`  ${name.padEnd(30)} ${width}x${height} ${Object.keys(maps).join(',')}`);
  }
  fs.writeFileSync(path.join(outRoot, 'surfaces.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`textures: ${index.length} sets, ${(bytes / 1048576).toFixed(1)} MB`);
}

// ---------------------------------------------------------------- models
async function exportModels() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const outRoot = path.join(art, 'Models');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  let count = 0, bytes = 0;
  for (const group of ['people', 'anims', 'veg', 'open']) {
    const base = path.join(game, 'assets', group);
    for (const f of walk(base)) {
      const rel = path.relative(base, f);
      const dst = path.join(outRoot, group, rel);
      mkdir(path.dirname(dst));
      if (!f.endsWith('.glb')) {
        // tree bark textures, impostor sheets and licence files travel with the models
        if (/\.(jpg|png|txt)$/.test(f)) { fs.copyFileSync(f, dst); bytes += fs.statSync(dst).size; }
        continue;
      }
      const doc = await io.read(f);
      const root = doc.getRoot();
      // WebP -> PNG (alpha) / JPEG (opaque); Unity has no WebP decoder
      for (const tex of root.listTextures()) {
        if (tex.getMimeType() !== 'image/webp') continue;
        const img = sharp(Buffer.from(tex.getImage()));
        const { hasAlpha } = await img.metadata();
        const out = hasAlpha ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
        tex.setImage(new Uint8Array(out)).setMimeType(hasAlpha ? 'image/png' : 'image/jpeg');
        const uri = tex.getURI(); if (uri) tex.setURI(uri.replace(/\.webp$/i, hasAlpha ? '.png' : '.jpg'));
      }
      for (const ext of root.listExtensionsUsed()) {
        if (ext.extensionName === EXTMeshoptCompression.EXTENSION_NAME || ext.extensionName === EXTTextureWebP.EXTENSION_NAME) ext.dispose();
      }
      // integer (quantized) vertex data must be declared, or strict importers like glTFast refuse it
      const quantized = root.listMeshes().some((m) => m.listPrimitives().some((p) => {
        const a = p.getAttribute('POSITION'), n = p.getAttribute('NORMAL'), t = p.getAttribute('TEXCOORD_0');
        return [a, n, t].some((x) => x && x.getComponentType() !== 5126);
      }));
      if (quantized && !root.listExtensionsUsed().some((e) => e.extensionName === KHRMeshQuantization.EXTENSION_NAME)) doc.createExtension(KHRMeshQuantization).setRequired(true);
      await io.write(dst, doc);
      bytes += fs.statSync(dst).size;
      count++;
    }
  }
  fs.copyFileSync(path.join(game, 'CREDITS.md'), path.join(outRoot, 'CREDITS.md'));
  console.log(`models: ${count} GLB files, ${(bytes / 1048576).toFixed(1)} MB`);
}

// ---------------------------------------------------------------- catalog
// arsenal.js builds the catalog at import time; bundle it with the 3D parts stubbed
async function exportCatalog() {
  const esbuild = await import('esbuild');
  const stub = {
    name: 'stub',
    setup(b) {
      b.onResolve({ filter: /^three$|\/open\.js$|\/gunparts\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        contents: a.path === 'three'
          ? 'const P = new Proxy(function(){}, { get: () => P, construct: () => P, apply: () => P }); export default P; export const Group = P, Mesh = P, Color = P, MeshStandardMaterial = P, BoxGeometry = P, CylinderGeometry = P, Shape = P, ExtrudeGeometry = P, TorusGeometry = P, Box3 = P, Vector3 = P, MathUtils = P, DoubleSide = 2, FrontSide = 0, SRGBColorSpace = "srgb";'
          : 'export const loadOpen = () => {}, loaded = () => null, instance = () => null, Q = (a, b) => a + "/" + b; export const dressGun = () => {}, factoryFit = () => {};',
        loader: 'js',
      }));
    },
  };
  const r = await esbuild.build({
    stdin: { contents: `import { WEAPONS, ATTACHMENTS, CATEGORIES } from './src/entities/arsenal.js'; globalThis.__cat = { WEAPONS, ATTACHMENTS, CATEGORIES };`, resolveDir: game, loader: 'js' },
    bundle: true, write: false, format: 'iife', plugins: [stub], logLevel: 'silent',
  });
  new Function(r.outputFiles[0].text)();
  const { WEAPONS, ATTACHMENTS, CATEGORIES } = globalThis.__cat;
  const out = path.join(unity, 'Tools/CoreTests/fixtures');
  mkdir(out);
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify({ weapons: Object.values(WEAPONS), attachments: ATTACHMENTS, categories: CATEGORIES }, null, 1) + '\n');
  console.log(`catalog: ${Object.keys(WEAPONS).length} weapons, ${ATTACHMENTS.length} attachments`);
}

// ---------------------------------------------------------------- world
async function exportWorld() {
  const { chromium } = require('playwright');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    const p = path.join(game, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(game) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    window.SB_SKIP_INTRO = true;
    try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: 'high', dynamicRes: false, timeScale: 0 })); } catch (e) { /* private mode */ }
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.click('#play');
  console.log('world: generating Calvera in headless Chromium (a few minutes)...');
  await page.waitForFunction(() => window.SB && window.SB.game && window.SB.game.city, null, { timeout: 900000, polling: 1000 });
  const data = await page.evaluate(() => {
    const G = window.SB.game, hm = G.hm;
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const r2 = (v) => Math.round(v * 100) / 100;
    let lo = Infinity, hi = -Infinity;
    for (const v of hm.h) { if (v < lo) lo = v; if (v > hi) hi = v; }
    // 16-bit heights, little-endian, row 0 = north edge (z = -half), as Unity's RAW importer expects with "flip" off
    const h16 = new Uint16Array(hm.n * hm.n);
    for (let i = 0; i < h16.length; i++) h16[i] = Math.round(((hm.h[i] - lo) / (hi - lo)) * 65535);
    let wlo = Infinity, whi = -Infinity;
    for (const v of hm.wl) if (v > -1e3) { if (v < wlo) wlo = v; if (v > whi) whi = v; }
    const w16 = new Uint16Array(hm.n * hm.n);
    for (let i = 0; i < w16.length; i++) w16[i] = hm.wl[i] > -1e3 ? 1 + Math.round(((hm.wl[i] - wlo) / Math.max(1e-3, whi - wlo)) * 65534) : 0;
    const C = G.city;
    const veg = G.veg && G.veg.list ? G.veg.list().map(([id, x, y, z, rot, k]) => [id, r2(x), r2(y), r2(z), r2(rot), Math.round(k * 1000) / 1000]) : [];
    return {
      world: { half: hm.half, size: hm.half * 2, n: hm.n, cell: hm.cell, hMin: lo, hMax: hi, waterMin: wlo, waterMax: whi, seaLevel: 0 },
      heights: b64(new Uint8Array(h16.buffer)), water: b64(new Uint8Array(w16.buffer)), splat: b64(hm.splat),
      roads: G.graph.edges.map((e) => ({ kind: e.kind, width: e.width, pts: e.pts.map((p) => (Array.isArray(p) ? [r2(p[0]), r2(p[1])] : [r2(p.x), r2(p.z)])) })),
      buildings: C.buildings.map((b) => ({ x: r2(b.x), z: r2(b.z), w: r2(b.w), d: r2(b.d), h: r2(b.h), y: r2(b.y), style: b.style, color: b.color, surf: b.surf || null })),
      roofs: (C.roofs || []).map((r) => ({ x: r2(r.x), z: r2(r.z), w: r2(r.w), d: r2(r.d), h: r2(r.h), y: r2(r.y), rot: r2(r.rot || 0), color: r.color })),
      veg,
      spawn: { x: G.player.pos.x, y: G.player.pos.y, z: G.player.pos.z, heading: G.player.heading },
    };
  });
  await browser.close();
  server.close();
  const out = path.join(unity, 'Data/World');
  mkdir(out);
  fs.writeFileSync(path.join(out, 'calvera-heights.r16'), Buffer.from(data.heights, 'base64'));
  fs.writeFileSync(path.join(out, 'calvera-water.r16'), Buffer.from(data.water, 'base64'));
  await sharp(Buffer.from(data.splat, 'base64'), { raw: { width: data.world.n, height: data.world.n, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(out, 'calvera-splat.png'));
  delete data.heights; delete data.water; delete data.splat;
  data.splatChannels = ['sand', 'forest', 'dry', 'paved'];
  fs.writeFileSync(path.join(out, 'calvera-world.json'), JSON.stringify(data));
  console.log(`world: ${data.world.n}^2 heights ${data.world.hMin.toFixed(1)}..${data.world.hMax.toFixed(1)} m, ${data.roads.length} roads, ${data.buildings.length} buildings, ${data.roofs.length} roofs, ${data.veg.length} plants`);
}

if (want('textures')) await exportTextures();
if (want('models')) await exportModels();
if (want('catalog')) await exportCatalog();
if (want('world')) await exportWorld();
