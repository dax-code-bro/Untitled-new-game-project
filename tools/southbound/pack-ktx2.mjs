// GPU-compressed textures for the models: every JPEG/PNG/WebP texture inside the GLBs in
// site/southbound/assets/{people,open} becomes KTX2 (Basis UASTC, zstd), and the tree bark,
// leaf and impostor images in assets/veg get .ktx2 copies next to them.
//
// Why: a JPEG/PNG/WebP is decoded and sits on the GPU as plain RGBA, 4 bytes a texel plus mips.
// UASTC transcodes to BC7 (desktop) or ASTC (phones), 1 byte a texel: a quarter of the video
// memory and bandwidth, and no image decode on the main thread while the game runs.
//
//   cd tools/southbound && node pack-ktx2.mjs [people|open|veg|all] [--dry]
//
// Colour and emissive maps: sRGB, light RDO (smaller files, invisible loss). Normal maps: no RDO,
// normal-map tuning. Roughness/metal/occlusion: linear. Sizes are snapped to powers of two so
// every mip level is a whole number of 4x4 blocks. Meshopt geometry compression is kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu, EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../site/southbound/assets');
const which = process.argv[2] || 'all', dry = process.argv.includes('--dry');
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const pot = (n) => 2 ** Math.round(Math.log2(Math.max(4, n)));
// decode, snap to a power of two (max 2048), hand the encoder raw RGBA
async function rgba(buf, max = 2048) {
  const img = sharp(Buffer.from(buf));
  const m = await img.metadata();
  const w = Math.min(max, pot(m.width)), h = Math.min(max, pot(m.height));
  const { data, info } = await img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height, hasAlpha: m.hasAlpha };
}
// etc1s: the small mode (about JPEG-sized files), for noisy organic maps where its blockiness doesn't show
async function encode(buf, kind, flipY = false, { etc1s = false, max = 2048 } = {}) {
  const src = await rgba(buf, max);
  const srgb = kind === 'color' || kind === 'emissive';
  const opts = {
    isUASTC: !etc1s, qualityLevel: 200, compressionLevel: 2, needSupercompression: true, generateMipmap: true, uastcLDRQualityLevel: 2,
    isSetKTX2SRGBTransferFunc: srgb, isPerceptual: srgb, isInputSRGB: srgb,
    isNormalMap: kind === 'normal', isYFlip: flipY, // flipY: images the game loads with TextureLoader (flipY on) stay the same way up
    enableRDO: kind === 'color' || kind === 'emissive' || kind === 'data', rdoQualityLevel: kind === 'data' ? 0.75 : 1.0,
    imageDecoder: async () => ({ data: src.data, width: src.width, height: src.height }),
  };
  return { ktx: await encodeToKTX2(new Uint8Array(1), opts), w: src.width, h: src.height };
}

// what each texture is used as (decides sRGB vs linear and normal-map tuning)
function kinds(doc) {
  const out = new Map();
  const mark = (t, k) => { if (t && !out.has(t)) out.set(t, k); };
  for (const m of doc.getRoot().listMaterials()) {
    mark(m.getNormalTexture(), 'normal');
    mark(m.getBaseColorTexture(), 'color');
    mark(m.getEmissiveTexture(), 'emissive');
    mark(m.getMetallicRoughnessTexture(), 'data');
    mark(m.getOcclusionTexture(), 'data');
  }
  return out;
}

let before = 0, after = 0, texN = 0, texPx = 0;
const t0 = Date.now();
// what the clothing code used to read off the pixels at run time (a compressed texture can't be
// drawn into a canvas): its overall brightness and the average colour of its middle
async function colourStats(buf) {
  const lin = (v) => Math.pow(v / 255, 2.2);
  const a = (await sharp(Buffer.from(buf)).resize(16, 16, { fit: 'fill' }).removeAlpha().raw().toBuffer());
  let lum = 0; for (let i = 0; i < a.length; i += 3) lum += Math.pow((a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) / 255, 2.2);
  const b = (await sharp(Buffer.from(buf)).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer());
  const avg = [0, 0, 0];
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) for (let k = 0; k < 3; k++) avg[k] += lin(b[(y * 32 + x) * 3 + k]);
  return { sbLum: +Math.max(0.05, lum / 256).toFixed(4), sbAvg: avg.map((v) => +(v / 256).toFixed(4)) };
}

async function glb(f) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  const K = kinds(doc);
  for (const m of root.listMaterials()) {
    const t = m.getBaseColorTexture();
    if (t && /image\/(jpeg|png|webp)/.test(t.getMimeType())) m.setExtras({ ...m.getExtras(), ...(await colourStats(t.getImage())) });
  }
  let changed = false;
  for (const tex of root.listTextures()) {
    const mime = tex.getMimeType();
    if (!/image\/(jpeg|png|webp)/.test(mime)) continue;
    const kind = K.get(tex) || 'color';
    const { ktx, w, h } = await encode(tex.getImage(), kind);
    tex.setImage(ktx).setMimeType('image/ktx2');
    const uri = tex.getURI(); if (uri) tex.setURI(uri.replace(/\.(jpe?g|png|webp)$/i, '.ktx2'));
    texN++; texPx += w * h; changed = true;
  }
  if (!changed) return;
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  if (!root.listTextures().some((t) => t.getMimeType() === 'image/webp')) for (const e of root.listExtensionsUsed()) if (e.extensionName === EXTTextureWebP.EXTENSION_NAME) e.dispose();
  const b0 = fs.statSync(f).size;
  if (!dry) await io.write(f, doc);
  const b1 = dry ? b0 : fs.statSync(f).size;
  before += b0; after += b1;
  console.log(path.relative(assets, f).padEnd(56), (b0 / 1024).toFixed(0).padStart(6), '->', (b1 / 1024).toFixed(0).padStart(6), 'KB');
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
// Only the models that are always loaded or seen up close: everyone in the street, the concept car,
// the guns. The rest of the open library (furniture, animals, interiors) loads on demand, is rarely
// on screen together, and its WebP files are 3-4x smaller than UASTC on disk, so it stays as it is.
const MODELS = { people: /\.glb$/, open: /(khronos\/CarConcept|real\/guns\/|real\/zk_weapons\/)[^/]*\.glb$/ };
for (const group of ['people', 'open']) {
  if (which !== 'all' && which !== group) continue;
  for (const f of walk(path.join(assets, group))) if (MODELS[group].test(f)) await glb(f);
}
// tree bark, leaves and impostors: .ktx2 copies (the game loads these; the originals stay for Unity)
if (which === 'all' || which === 'veg') {
  for (const f of walk(path.join(assets, 'veg'))) {
    const m = /\/([^/]+)\.(jpg|png)$/.exec(f);
    if (!m) continue;
    if (process.argv.includes('--bark') && !/^bark_/.test(m[1])) continue;
    const kind = /_normal$/.test(m[1]) ? 'normal' : /_(roughness|ao)$/.test(m[1]) ? 'data' : 'color';
    // bark tiles round trunks: its colour, AO and roughness go ETC1S, its normals UASTC at 512
    const bark = /^bark_/.test(m[1]);
    const { ktx, w, h } = await encode(fs.readFileSync(f), kind, true, { etc1s: bark && kind !== 'normal', max: bark && kind === 'normal' ? 512 : 2048 });
    const out = f.replace(/\.(jpg|png)$/, '.ktx2');
    if (!dry) fs.writeFileSync(out, ktx);
    before += fs.statSync(f).size; after += ktx.byteLength; texN++; texPx += w * h;
    console.log(path.relative(assets, out).padEnd(56), (fs.statSync(f).size / 1024).toFixed(0).padStart(6), '->', (ktx.byteLength / 1024).toFixed(0).padStart(6), 'KB');
  }
}
console.log(`${texN} textures, ${(texPx / 1e6).toFixed(1)} Mpx: files ${(before / 2 ** 20).toFixed(1)} -> ${(after / 2 ** 20).toFixed(1)} MB; ` +
  `video memory ${((texPx * 4 * 1.33) / 2 ** 20).toFixed(0)} MB as RGBA -> ${((texPx * 1.33) / 2 ** 20).toFixed(0)} MB as BC7/ASTC; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
