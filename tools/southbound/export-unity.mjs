// Exports Southbound's art and data into the Unity project (southbound-unity/).
//
//   node tools/southbound/export-unity.mjs [textures] [mirror] [models] [catalog] [world] [cars] [parked] [street]
//
// With no arguments it runs every step.
//
// textures  assets/textures/*.ktx2 -> Assets/Southbound/Art/Surfaces/<Set>/
//           BaseColor (JPG), Normal (PNG, OpenGL +Y), Mask (PNG: R metal, G AO,
//           B detail mask, A smoothness = 1 - roughness, the HDRP Lit layout),
//           Height (PNG), Emission (JPG), TerrainMask (the mask with height in B,
//           for HDRP terrain layers), plus surface.json (tile size in metres).
// mirror    more photo-scanned CC0 sets (siding, stucco, bricks, roofs, asphalt, manholes...) from the CC0
//           mirror the web game's textures came from, bundled at 512 px like the rest (MIRROR_SETS).
// models    assets/{people,anims,veg,open}/**.glb -> Assets/Southbound/Art/Models/
//           Meshopt is decoded and WebP textures become PNG/JPG, so glTFast
//           imports them with no extra packages.
// catalog   the weapon + attachment catalog as JSON, the fixture the C# port
//           is tested against (Tools/CoreTests/fixtures/catalog.json).
// world     runs the web game headless and dumps Calvera: terrain heights,
//           ground splat, water, roads, buildings, roofs, trees and the 3D facade
//           pieces (cornices, shopfronts, porches, window sills...)
//           (southbound-unity/Data/World/).
// cars      every catalogue car's body spec, handling and paint (Data/Vehicles/cars.json: the C# car
//           builder rebuilds the bodies from these, the web game's own SDF + surface nets), the exact
//           wheel meshes for each spoke style (wheels.json), and the numbers the C# port is tested
//           against (Tools/CoreTests/fixtures/cars-parity.json: SDF samples, mesh counts, drive runs).
//           Runs carbuilder.js in a tiny headless page (no game load: seconds).
// parked    runs the web game headless and lists the cars parked along Calvera's streets and in the
//           driveways (Data/World/calvera-parked.json).
// street    everything else on the streets (sidewalks, kerbs, lights, poles and wires, palms, yards, fences,
//           storefronts, signs, billboards, clutter): geometry, materials, textures and every instance
//           (Data/World/calvera-street.json + street-tex/; see unity-street.mjs).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { exportStreet } from './unity-street.mjs';

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
  const f = new B.KTX2File(file instanceof Uint8Array ? file : new Uint8Array(fs.readFileSync(file)));
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
    const r = await convertSet(name, maps, outRoot, { tileMeters: SIZES[name] || 3, source: SOURCE(name), terrain: TERRAIN.has(name) });
    bytes += r.bytes; index.push(r.meta);
  }
  fs.writeFileSync(path.join(outRoot, 'surfaces.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`textures: ${index.length} sets, ${(bytes / 1048576).toFixed(1)} MB`);
}

// one CC0 set (KTX2 files or buffers per map) -> the Unity layout; `size` resamples (the bundled sets are 512 px)
async function convertSet(name, maps, outRoot, { tileMeters = 3, source = 'ambientcg', terrain = false, size = 0 } = {}) {
  let bytes = 0;
  {
    const dir = path.join(outRoot, name);
    mkdir(dir);
    const img = {};
    for (const [k, f] of Object.entries(maps)) {
      let d = await decodeKTX2(f);
      if (size && (d.width !== size || d.height !== size)) {
        const buf = await sharp(Buffer.from(d.data.buffer, d.data.byteOffset, d.data.byteLength), { raw: { width: d.width, height: d.height, channels: 4 } })
          .resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
        d = { width: size, height: size, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
      }
      img[k] = d;
    }
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
    if (same('height') && terrain) {
      const H = img.height.data, tmask = Uint8Array.from(mask);
      for (let i = 0; i < n; i++) tmask[i * 4 + 2] = H[i * 4];
      await write(`${name}_TerrainMask.png`, raw(tmask).png({ compressionLevel: 9 }));
    }
    if (same('height')) await write(`${name}_Height.png`, raw(img.height.data).extractChannel(0).png({ compressionLevel: 9 }));
    if (same('emit')) await write(`${name}_Emission.jpg`, raw(img.emit.data).removeAlpha().jpeg({ quality: 90 }));
    const meta = { name, source, tileMeters, size: width, maps: Object.keys(maps).sort(), files };
    fs.writeFileSync(path.join(dir, 'surface.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(`  ${name.padEnd(30)} ${width}x${height} ${Object.keys(maps).join(',')}`);
    return { meta, bytes };
  }
}

// ---------------------------------------------------------------- more CC0 sets from the mirror
// Photo-scanned ambientCG / Poly Haven sets the web game doesn't stream, picked for Calvera's buildings,
// roofs and streets (houses in painted lap siding and stucco, brick blocks, clay and shingle roofs,
// patched asphalt, manhole covers), fetched from the CC0 mirror the web game's textures came from
// (github.com/Papyszoo/CC0-Public-Domain-Textures, CC0) and bundled at 512 px like the rest; the Unity
// editor downloads the 2K-8K originals from ambientCG / Poly Haven themselves.
export const MIRROR_SETS = {
  WoodSiding009: 2.4, WoodSiding011: 2.4, Plaster001: 3.0, Plaster003: 2.6, PaintedPlaster014: 3.0, PaintedPlaster017: 3.0,
  Bricks059: 2.2, Bricks085: 2.2, Bricks090: 2.2, Bricks097: 2.2, Bricks066: 2.6, Concrete045: 2.5, Concrete047A: 2.5,
  RoofingTiles001: 2.6, RoofingTiles008: 2.4, RoofingTiles014A: 2.6, Asphalt026A: 4.0, Asphalt031: 4.0, ManholeCover011: 1.2,
  Ground054: 3.0, Bark007: 2.0,
};
const MIRROR_URL = 'https://github.com/Papyszoo/CC0-Public-Domain-Textures';
const MAP_OF = (file) => {
  const f = file.replace(/\.ktx2$/, '');
  if (/preview|NormalDX|_dx$/i.test(f)) return null;
  for (const [k, re] of [['color', /(Color|albedo|diff)$/i], ['normal', /(NormalGL|nor_gl|normal)$/i], ['rough', /(Roughness|rough)$/i],
    ['height', /(Displacement|disp|height)$/i], ['ao', /(AmbientOcclusion|_ao)$/i], ['metal', /(Metalness|metal)$/i], ['emit', /(Emission|emit)$/i]]) if (re.test(f)) return k;
  return null;
};
async function exportMirror() {
  const { execFileSync } = await import('node:child_process');
  const cache = process.env.SB_CC0_MIRROR || path.join(process.env.HOME || '.', '.cache/sb-cc0-mirror');
  if (!fs.existsSync(path.join(cache, '.git'))) {
    mkdir(path.dirname(cache));
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '1', MIRROR_URL, cache], { stdio: 'inherit' });
  }
  const git = (...a) => execFileSync('git', ['-C', cache, ...a], { maxBuffer: 1 << 28 });
  const outRoot = path.join(art, 'Surfaces');
  const indexFile = path.join(outRoot, 'surfaces.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
  let bytes = 0;
  for (const [name, tileMeters] of Object.entries(MIRROR_SETS)) {
    const source = /^[A-Z]/.test(name) ? 'ambientcg' : 'polyhaven';
    const dir = `packs/${source}-textures/textures/${name}`;
    const files = git('ls-tree', '-r', '--name-only', 'HEAD', dir).toString().split('\n').filter((f) => f.endsWith('.ktx2'));
    const maps = {};
    for (const f of files) { const k = MAP_OF(path.basename(f)); if (k && !maps[k]) maps[k] = new Uint8Array(git('show', `HEAD:${f}`)); }
    if (!maps.color || !maps.normal) { console.log(`  ${name}: missing colour/normal in the mirror, skipped`); continue; }
    const r = await convertSet(name, maps, outRoot, { tileMeters, source, size: 512 });
    bytes += r.bytes;
    const at = index.findIndex((m) => m.name === name);
    if (at >= 0) index[at] = r.meta; else index.push(r.meta);
  }
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
  console.log(`mirror: ${Object.keys(MIRROR_SETS).length} sets, ${(bytes / 1048576).toFixed(1)} MB`);
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
      // WebP and KTX2 (the game's GPU-compressed textures) -> PNG (alpha) / JPEG (opaque); Unity reads neither
      for (const tex of root.listTextures()) {
        const mime = tex.getMimeType();
        if (mime !== 'image/webp' && mime !== 'image/ktx2') continue;
        let img;
        if (mime === 'image/ktx2') {
          const k = await decodeKTX2(tex.getImage());
          img = sharp(Buffer.from(k.data), { raw: { width: k.width, height: k.height, channels: 4 } });
          const opaque = (() => { for (let i = 3; i < k.data.length; i += 4) if (k.data[i] < 250) return false; return true; })();
          const out = opaque ? await img.removeAlpha().jpeg({ quality: 92 }).toBuffer() : await img.png({ compressionLevel: 9 }).toBuffer();
          tex.setImage(new Uint8Array(out)).setMimeType(opaque ? 'image/jpeg' : 'image/png');
          const uri = tex.getURI(); if (uri) tex.setURI(uri.replace(/\.ktx2$/i, opaque ? '.jpg' : '.png'));
          continue;
        }
        img = sharp(Buffer.from(tex.getImage()));
        const { hasAlpha } = await img.metadata();
        const out = hasAlpha ? await img.png({ compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
        tex.setImage(new Uint8Array(out)).setMimeType(hasAlpha ? 'image/png' : 'image/jpeg');
        const uri = tex.getURI(); if (uri) tex.setURI(uri.replace(/\.webp$/i, hasAlpha ? '.png' : '.jpg'));
      }
      for (const ext of root.listExtensionsUsed()) {
        if (ext.extensionName === EXTMeshoptCompression.EXTENSION_NAME || ext.extensionName === EXTTextureWebP.EXTENSION_NAME || ext.extensionName === 'KHR_texture_basisu') ext.dispose();
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
      buildings: C.buildings.map((b) => ({ x: r2(b.x), z: r2(b.z), w: r2(b.w), d: r2(b.d), h: r2(b.h), y: r2(b.y), style: b.style, color: b.color, surf: b.surf || null, street: b.street ?? 15 })),
      roofs: (C.roofs || []).map((r) => ({ x: r2(r.x), z: r2(r.z), w: r2(r.w), d: r2(r.d), h: r2(r.h), y: r2(r.y), rot: r2(r.rot || 0), color: r.color })),
      veg,
      facades: G.city.facades && G.city.facades.exportPieces ? G.city.facades.exportPieces() : null,
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
  if (data.facades) { fs.writeFileSync(path.join(out, 'calvera-facades.json'), JSON.stringify(data.facades)); delete data.facades; }
  data.splatChannels = ['sand', 'forest', 'dry', 'paved'];
  fs.writeFileSync(path.join(out, 'calvera-world.json'), JSON.stringify(data));
  console.log(`world: ${data.world.n}^2 heights ${data.world.hMin.toFixed(1)}..${data.world.hMax.toFixed(1)} m, ${data.roads.length} roads, ${data.buildings.length} buildings, ${data.roofs.length} roofs, ${data.veg.length} plants`);
}

// ---------------------------------------------------------------- cars
// a static server for the game folder that can patch a module's source on the way out
function gameServer(patch = {}) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (patch[url]) { res.writeHead(200, { 'Content-Type': patch[url].type || 'text/javascript' }); return res.end(patch[url].body()); }
    const p = path.join(game, url.replace(/\/$/, '/index.html'));
    if (!p.startsWith(game) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

async function exportCars() {
  const { chromium } = require('playwright');
  const builderSrc = fs.readFileSync(path.join(game, 'src/assets/carbuilder.js'), 'utf8');
  const server = await gameServer({
    // bodySDF and the wheel builder aren't exported by the game; the export page needs them
    '/src/assets/carbuilder.js': { body: () => builderSrc + '\nexport { bodySDF, wheelGeometryRaw, P as SPECS_ALL };\n' },
    '/__cars.html': { type: 'text/html', body: () => `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/addons/"}}</script><script type="module">
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAND, PAINTS as SHOP_PAINTS } from '/src/assets/catalog.js';
import { VEHICLES } from '/src/assets/library.js';
import { bodySDF, wheelGeometryRaw, surfaceNets, specOf, hasSpec, FIXED_PAINT, SECOND_PAINT, SPECS_ALL } from '/src/assets/carbuilder.js';
import { cabinLayout, buildInterior, wheelGeometryCab } from '/src/assets/cabin.js';
window.__run = () => {
  const clean = (o) => JSON.parse(JSON.stringify(o));
  // every procedural car the game can put on the road: the catalogue plus the base bodies traffic uses
  const ids = [...new Set([...LAND.map((c) => c.id), ...Object.keys(VEHICLES)])].filter((id) => hasSpec(id));
  const land = new Map(LAND.map((c) => [c.id, c]));
  const cars = ids.map((id) => {
    const s = specOf(id), v = VEHICLES[id] || {}, c = land.get(id) || { id, cls: 'Traffic', name: v.name || id, price: 0, base: id, restricted: true };
    const L = cabinLayout(s);
    return { id, cls: c.cls, name: c.name, price: c.price, base: c.base, restricted: !!c.restricted, catalog: land.has(id),
      stats: { len: v.len ?? s.L, accel: v.accel ?? 9, top: v.top ?? 50, grip: v.grip ?? 7.5, weight: v.weight ?? 0 },
      paint: FIXED_PAINT[id] || s.paint || null, paint2: SECOND_PAINT[id] || s.paint2 || null,
      spec: clean(s), cabin: L ? { seat: L.seats[0], wheel: { x: L.wheel.x, y: L.wheel.y, z: L.wheel.z, tau: L.wheel.tau, R: L.wheel.R } } : null };
  });
  // the random paint mix on the roads (carbuilder.js PAINTS: r, g, b, metal, weight) and the paint shop
  const roadPaints = [[0.80,0.80,0.78,0.0,22],[0.012,0.012,0.014,0.3,18],[0.12,0.125,0.13,0.6,15],[0.42,0.43,0.45,1.0,13],[0.012,0.035,0.11,0.7,8],[0.32,0.012,0.012,0.4,8],[0.36,0.28,0.19,0.6,3],[0.03,0.08,0.045,0.6,2],[0.06,0.1,0.16,0.8,4],[0.5,0.18,0.02,0.3,2],[0.2,0.2,0.19,0.0,5]];
  // ---- wheels: the exact geometry for each spoke style at a reference size (Unity scales it per car:
  // radius on the wheel's y/z, tread width on x), indexed, quantized (mm / 1/127), a small palette
  const RW = 0.35, TW = 0.24, styles = [0, 5, 6, 10, 14];
  const b64 = (buf) => { const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const wheels = styles.map((spokes) => ({ spokes, levels: [0, 1, 2].map((level) => {
    let g = wheelGeometryRaw({ Rw: RW, tw: TW, spokes }, level);
    g = mergeVertices(g, 1e-5);
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, M = g.attributes.aRM;
    const pal = [], key = new Map(), pi = new Uint8Array(P.count), pos = new Int16Array(P.count * 3), nrm = new Int8Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const e = [C.getX(i), C.getY(i), C.getZ(i), M.getX(i), M.getY(i)].map((v) => Math.round(v * 1000) / 1000), k = e.join(',');
      if (!key.has(k)) { key.set(k, pal.length); pal.push(e); }
      pi[i] = key.get(k);
      pos[i * 3] = Math.round(P.getX(i) * 10000); pos[i * 3 + 1] = Math.round(P.getY(i) * 10000); pos[i * 3 + 2] = Math.round(P.getZ(i) * 10000);
      const nl = Math.hypot(N.getX(i), N.getY(i), N.getZ(i)) || 1;
      nrm[i * 3] = Math.round(N.getX(i) / nl * 127); nrm[i * 3 + 1] = Math.round(N.getY(i) / nl * 127); nrm[i * 3 + 2] = Math.round(N.getZ(i) / nl * 127);
    }
    const idx = g.index.array, ix = P.count < 65536 ? new Uint16Array(idx) : new Uint32Array(idx);
    return { level, verts: P.count, tris: idx.length / 3, posScale: 1e-4, palette: pal, pos: b64(pos), nrm: b64(nrm), pal: b64(pi), idx: b64(ix), idx32: !(ix instanceof Uint16Array) };
  }) }));
  // ---- parity fixture: a few bodies covering every shape feature
  const pickBy = (f) => cars.find((c) => f(c.spec))?.id;
  const sample = [...new Set(['sedan', 'firetruck', 'police', 'truck', 'delivery',
    pickBy((s) => s.flare && s.rack && s.spare), pickBy((s) => s.bullbar), pickBy((s) => s.scoop), pickBy((s) => s.bulge && s.waist),
    pickBy((s) => s.bus), pickBy((s) => s.steps), pickBy((s) => s.chrome), pickBy((s) => s.tow)].filter(Boolean))];
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const shapes = sample.map((id) => {
    const s = specOf(id), f = bodySDF(s), top = Math.max(s.roof, s.box ? s.box[2] : 0) + 0.25;
    const min = [-s.W / 2 - 0.3, 0.0, -s.L / 2 - 0.1], max = [s.W / 2 + 0.3, top, s.L / 2 + 0.1];
    const pts = [];
    for (let i = 0; i < 400; i++) { const x = min[0] + rnd() * (max[0] - min[0]), y = min[1] + rnd() * (max[1] - min[1]), z = min[2] + rnd() * (max[2] - min[2]); pts.push([x, y, z, f(x, y, z)]); }
    const h = s.L / 40, g = surfaceNets(f, min, max, h);
    const P = g.attributes.position.array; let sx = 0, sy = 0, sz = 0; for (let i = 0; i < P.length; i += 3) { sx += P[i]; sy += P[i + 1]; sz += P[i + 2]; }
    g.computeBoundingBox();
    return { id, h, min, max, verts: P.length / 3, tris: g.index.count / 3, sum: [sx, sy, sz], bbox: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()], samples: pts };
  });
  // ---- drive model: the web game's driving equations (entities/vehicle.js physics), run straight
  // off the page so the C# port can be checked against them number for number
  const lerp = (a, b, t) => a + (b - a) * t;
  const step = (st, t, inp, dt) => {
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading), sx = Math.cos(st.heading), sz = -Math.sin(st.heading);
    let vF = st.vx * fx + st.vz * fz, vR = st.vx * sx + st.vz * sz;
    const thr = inp.throttle, brk = inp.brake;
    if (thr > 0) {
      if (vF < -0.5) vF += 18 * thr * dt;
      else { const boost = inp.nitro ? 1.8 : 1; vF += t.accel * boost * thr * Math.max(0, 1 - vF / (t.top * (boost > 1 ? 1.15 : 1))) * dt * (vF < 8 ? 1.25 : 1); }
    }
    if (brk > 0) { if (vF > 0.5) vF -= 22 * (t.brakeK || 1) * brk * dt; else vF = Math.max(vF - 6 * brk * dt, -9); }
    if (inp.handbrake) vF -= Math.sign(vF) * 6 * dt;
    vF -= Math.sign(vF) * Math.min(Math.abs(vF), (0.9 + Math.abs(vF) * Math.abs(vF) * 0.0012) * dt * (thr > 0 ? 0.3 : 1));
    const maxSteer = 0.62 / (1 + Math.abs(vF) * 0.055);
    st.steer = lerp(st.steer, inp.steer * maxSteer, Math.min(1, dt * 7));
    const yaw = (vF / (t.wf - t.wr)) * Math.tan(st.steer);
    st.heading += yaw * dt * (inp.handbrake ? 1.35 : 1);
    vR *= Math.exp(-(inp.handbrake ? 1.4 : t.grip) * dt);
    const nfx = Math.sin(st.heading), nfz = Math.cos(st.heading), nsx = Math.cos(st.heading), nsz = -Math.sin(st.heading);
    st.vx = nfx * vF + nsx * vR; st.vz = nfz * vF + nsz * vR; st.x += st.vx * dt; st.z += st.vz * dt; st.vF = vF; st.vR = vR; st.yaw = yaw;
  };
  const SCEN = {
    launch: { secs: 12, at: (t) => ({ throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false }) },
    nitro: { secs: 6, at: (t) => ({ throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: true }) },
    turn: { secs: 4, v0: 20, at: (t) => ({ throttle: 0.4, brake: 0, steer: 1, handbrake: false, nitro: false }) },
    brake: { secs: 4, v0: 30, at: (t) => ({ throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false }) },
    reverse: { secs: 5, at: (t) => ({ throttle: 0, brake: 1, steer: -0.5, handbrake: false, nitro: false }) },
    handbrake: { secs: 3, v0: 22, at: (t) => ({ throttle: 0, brake: 0, steer: t < 0.5 ? 0 : -1, handbrake: t > 0.4, nitro: false }) },
    coast: { secs: 8, v0: 25, at: (t) => ({ throttle: 0, brake: 0, steer: 0.3, handbrake: false, nitro: false }) },
  };
  const driveCars = [...new Set(['sedan', 'sedan-sports', 'firetruck', ...cars.filter((c) => c.catalog).filter((_, i) => i % 9 === 0).map((c) => c.id)])];
  const drives = driveCars.map((id) => {
    const c = cars.find((q) => q.id === id), s = c.spec;
    const t = { accel: c.stats.accel, top: c.stats.top, grip: c.stats.grip, brakeK: 1, wf: s.axF, wr: s.axR };
    const runs = {};
    for (const [name, sc] of Object.entries(SCEN)) {
      const st = { x: 0, z: 0, vx: 0, vz: sc.v0 || 0, heading: 0, steer: 0, vF: 0, vR: 0, yaw: 0 }, dt = 1 / 60, out = [];
      for (let i = 1; i <= sc.secs * 60; i++) { step(st, t, sc.at((i - 1) * dt), dt); if (i % 30 === 0) out.push([+(i * dt).toFixed(3), st.vF, st.vR, st.heading, st.x, st.z, st.steer]); }
      runs[name] = out;
    }
    return { id, t, runs };
  });
  // ---- cabins: each body's interior (cabin.js buildInterior: dash, dials, console, seats, bench, belts, visors,
  // mirror), indexed and quantized to the millimetre with a small palette (colour, roughness, metalness), and
  // the steering wheel in its own frame (placed per car by cabin.wheel)
  const pack = (g, scale) => {
    g = mergeVertices(g, 1e-5);
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, M = g.attributes.aRM;
    const pal = [], key = new Map(), pi = new Uint8Array(P.count), pos = new Int16Array(P.count * 3), nrm = new Int8Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const e = [C ? C.getX(i) : 0.1, C ? C.getY(i) : 0.1, C ? C.getZ(i) : 0.1, M ? M.getX(i) : 0.8, M ? M.getY(i) : 0].map((v) => Math.round(v * 1000) / 1000), k = e.join(',');
      if (!key.has(k)) { key.set(k, pal.length); pal.push(e); }
      pi[i] = Math.min(255, key.get(k));
      pos[i * 3] = Math.round(P.getX(i) / scale); pos[i * 3 + 1] = Math.round(P.getY(i) / scale); pos[i * 3 + 2] = Math.round(P.getZ(i) / scale);
      const nl = N ? Math.hypot(N.getX(i), N.getY(i), N.getZ(i)) || 1 : 1;
      if (N) { nrm[i * 3] = Math.round(N.getX(i) / nl * 127); nrm[i * 3 + 1] = Math.round(N.getY(i) / nl * 127); nrm[i * 3 + 2] = Math.round(N.getZ(i) / nl * 127); }
    }
    const idx = g.index.array, ix = P.count < 65536 ? new Uint16Array(idx) : new Uint32Array(idx);
    return { verts: P.count, tris: idx.length / 3, posScale: scale, palette: pal, pos: b64(pos), nrm: b64(nrm), pal: b64(pi), idx: b64(ix), idx32: !(ix instanceof Uint16Array) };
  };
  const cabins = {};
  for (const c of cars) {
    const g = buildInterior(specOf(c.id));
    if (!g) continue;
    if (!g.attributes.normal) g.computeVertexNormals();
    cabins[c.id] = pack(g, 1e-3);
  }
  const wg = wheelGeometryCab(); if (!wg.attributes.normal) wg.computeVertexNormals();
  const steering = pack(wg, 1e-4);
  return { cars, roadPaints, shopPaints: SHOP_PAINTS, wheels, wheelRef: { Rw: RW, tw: TW }, parity: { shapes, drives }, cabins, steering };
};
window.__ready = true;
</script>` },
  });
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/__cars.html`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch(() => { throw new Error('cars page: ' + errs.join(' | ')); });
  const data = await page.evaluate(() => window.__run());
  await browser.close(); server.close();
  const out = path.join(unity, 'Data/Vehicles'), fx = path.join(unity, 'Tools/CoreTests/fixtures');
  mkdir(out); mkdir(fx);
  fs.writeFileSync(path.join(out, 'cars.json'), JSON.stringify({ cars: data.cars, roadPaints: data.roadPaints, shopPaints: data.shopPaints }));
  fs.writeFileSync(path.join(out, 'wheels.json'), JSON.stringify({ ref: data.wheelRef, styles: data.wheels }));
  fs.writeFileSync(path.join(out, 'cabins.json'), JSON.stringify({ steering: data.steering, cars: data.cabins }));
  fs.writeFileSync(path.join(fx, 'cars-parity.json'), JSON.stringify(data.parity));
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
  console.log(`cars: ${data.cars.length} bodies (${kb(path.join(out, 'cars.json'))}), wheels ${data.wheels.length} styles x 3 levels (${kb(path.join(out, 'wheels.json'))}), parity: ${data.parity.shapes.length} shapes, ${data.parity.drives.length} drive sets`);
  console.log(`cars: ${Object.keys(data.cabins).length} cabins (${kb(path.join(out, 'cabins.json'))})`);
}

// ---------------------------------------------------------------- parked cars
async function exportParked() {
  const { chromium } = require('playwright');
  const server = await gameServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    window.SB_SKIP_INTRO = true;
    try { localStorage.setItem('southbound.settings.v1', JSON.stringify({ platform: 'pc', preset: 'high', dynamicRes: false, timeScale: 0 })); } catch (e) { /* private mode */ }
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.click('#play');
  console.log('parked: generating Calvera in headless Chromium (a few minutes)...');
  await page.waitForFunction(() => window.SB && window.SB.game && window.SB.game.city, null, { timeout: 900000, polling: 1000 });
  const data = await page.evaluate(() => {
    const G = window.SB.game, r2 = (v) => Math.round(v * 100) / 100;
    const seen = new Set(), list = [];
    const add = (v, where) => { if (!v || seen.has(v) || v.isBoat || v.isAir || !v.pos) return; seen.add(v); list.push({ type: v.type, x: r2(v.pos.x), y: r2(v.pos.y), z: r2(v.pos.z), heading: Math.round(v.heading * 1000) / 1000, where }); };
    for (const v of G.parked || []) add(v, v.userData?.driveway ? 'driveway' : 'street');
    const P = G.career?.p, start = G.S?.lastVehicle;
    return { parked: list, player: start ? { type: start.type, x: r2(start.pos.x), z: r2(start.pos.z), heading: start.heading } : null, spawn: { x: G.player.pos.x, z: G.player.pos.z, heading: G.player.heading } };
  });
  await browser.close(); server.close();
  const out = path.join(unity, 'Data/World');
  mkdir(out);
  fs.writeFileSync(path.join(out, 'calvera-parked.json'), JSON.stringify(data));
  console.log(`parked: ${data.parked.length} cars (${[...new Set(data.parked.map((p) => p.type))].length} types)`);
}

if (want('textures')) await exportTextures();
if (want('mirror')) await exportMirror();
if (want('models')) await exportModels();
if (want('catalog')) await exportCatalog();
if (want('world')) await exportWorld();
if (want('cars')) await exportCars();
if (want('parked')) await exportParked();
if (want('street')) await exportStreet({ repo, game, unity });
