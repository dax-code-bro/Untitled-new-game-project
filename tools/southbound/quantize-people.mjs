// Quantize the MakeHuman character GLBs (positions/normals/uvs) to cut download size.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { quantize, dedup, prune } from '@gltf-transform/functions';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/southbound/assets/people');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of fs.readdirSync(dir).filter((f) => /^(hero|mh_).*\.glb$/.test(f))) {
  const p = path.join(dir, f), before = fs.statSync(p).size;
  const doc = await io.read(p);
  await doc.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
  await io.write(p, doc);
  console.log(f, (before / 1e6).toFixed(1), '->', (fs.statSync(p).size / 1e6).toFixed(1), 'MB');
}
