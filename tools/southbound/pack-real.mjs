// Packs the realistic open models (CC0 Quaternius Zombie Apocalypse Kit:
// guns, pickup/truck, street props, dogs; CC-BY Remington 870 scan) into
// site/southbound/assets/open/real/<group>/<name>.glb
//   node tools/southbound/pack-real.mjs <rawDir>   (rawDir/<group>/<name>.gltf)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, flatten, join } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = path.resolve(process.argv[2]);
const out = path.resolve(here, '../../site/southbound/assets/open/real');
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
let total = 0;
for (const group of fs.readdirSync(raw)) {
  const dir = path.join(raw, group);
  if (!fs.statSync(dir).isDirectory()) continue;
  // a folder holding scene.gltf is one Sketchfab download (CC-BY gun): packs to guns/<folder>.glb
  const single = fs.existsSync(path.join(dir, 'scene.gltf'));
  for (const f of single ? ['scene.gltf'] : fs.readdirSync(dir).filter((n) => n.endsWith('.gltf'))) {
    const doc = await io.read(path.join(dir, f));
    const tris0 = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3), 0), 0);
    const heavy = group === 'remington' || (single && tris0 > 40000);
    const steps = [dedup(), prune()];
    if (heavy) steps.push(flatten(), join(), weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(0.5, 30000 / Math.max(tris0, 1)), error: 0.0008 }));
    steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [heavy ? 1024 : 512, heavy ? 1024 : 512] }));
    steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await doc.transform(...steps);
    if (single && !heavy) steps.splice(2, 0, textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }));
    const name = group === 'remington' ? 'Remington870' : single ? group : f.replace('.gltf', '');
    const dst = path.join(out, group === 'remington' || single ? 'guns' : group, name + '.glb');
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await io.write(dst, doc);
    const sz = fs.statSync(dst).size; total += sz;
    const tris = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
    console.log(dst.replace(out + '/', ''), (sz / 1024).toFixed(0) + ' KB', tris + ' tris');
  }
}
console.log('total', (total / 1e6).toFixed(2), 'MB');
