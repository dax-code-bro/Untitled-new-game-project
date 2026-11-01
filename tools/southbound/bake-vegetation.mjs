// Bakes trees/bushes with ez-tree and copies grass/rock/bark/leaf assets into
// site/southbound/assets/veg/.  Needs node_modules with three, @dgreenheck/ez-tree, playwright.
//   node bake-vegetation.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { quantize, weld } from '@gltf-transform/functions';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = path.join(here, 'node_modules');
const out = path.resolve(here, '../../site/southbound/assets/veg');
fs.mkdirSync(out, { recursive: true });
const roots = { '/three/': path.join(nm, 'three') + '/', '/ez-tree/': path.join(nm, '@dgreenheck/ez-tree') + '/', '/': path.join(here, 'bake') + '/' };
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const pre = Object.keys(roots).find((p) => u.startsWith(p));
  const p = path.join(roots[pre], u.slice(pre.length));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/vegetation.html`);
await page.waitForFunction(() => window.done, null, { timeout: 600000 });
const result = await page.evaluate(() => window.result);
await browser.close(); srv.close();
if (result.error) { console.error(result.error); process.exit(1); }
const manifest = { trees: [] };
for (const v of result.variants) {
  const io = new NodeIO();
  const doc = await io.readBinary(new Uint8Array(Buffer.from(v.glb, 'base64')));
  await doc.transform(weld(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  fs.writeFileSync(path.join(out, `${v.id}.glb`), await io.writeBinary(doc));
  fs.writeFileSync(path.join(out, `${v.id}_impostor.png`), Buffer.from(v.impostor.split(',')[1], 'base64'));
  const { glb, impostor, ...meta } = v;
  manifest.trees.push(meta);
  console.log(v.id, v.preset, 'tris', v.tris, 'height', v.height.toFixed(1));
}
// shared textures and ground-cover models from ez-tree (MIT; bark from Poly Haven, CC0)
const ez = path.join(nm, '@dgreenheck/ez-tree/src');
for (const b of ['pine', 'oak', 'willow', 'birch']) for (const k of ['color', 'normal', 'roughness', 'ao']) fs.copyFileSync(path.join(ez, `lib/assets/bark/${b}_${k}_1k.jpg`), path.join(out, `bark_${b}_${k}.jpg`));
for (const l of ['pine', 'oak', 'ash', 'aspen']) fs.copyFileSync(path.join(ez, `lib/assets/leaves/${l}_color.png`), path.join(out, `leaf_${l}.png`));
// these demo models are Draco-compressed: decode once here so the game needs no Draco decoder
{
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const draco3d = require('draco3dgltf');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  for (const f of ['grass.glb', 'rock1.glb', 'rock2.glb', 'rock3.glb']) {
    const doc = await io.read(path.join(ez, 'app/public', f));
    for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
    await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
    await io.write(path.join(out, f), doc);
  }
}
fs.copyFileSync(path.join(nm, '@dgreenheck/ez-tree/LICENSE'), path.join(out, 'LICENSE-ez-tree.txt'));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('wrote', out);
