// Packs the open-source 3D models used in the game into site/southbound/assets/open/:
//  - Khronos glTF Sample Assets (realistic furniture, props, fish, fox, concept car)
//  - Quaternius CC0 packs (animated animals, house interior, fish, bows)
// Textures are re-encoded as WebP (EXT_texture_webp) at game-friendly sizes.
//   node tools/southbound/pack-open.mjs <dlDir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const dl = path.resolve(process.argv[2]);
const out = path.resolve(here, '../../site/southbound/assets/open');
fs.mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const K = (n, size = 1024) => [path.join(dl, 'khronos', n + '.glb'), `khronos/${n}.glb`, size];
const Q = (pack, n, size = 512) => [path.join(dl, 'quaternius-showcase/public/glb', pack, n + '.glb'), `quaternius/${pack}/${n}.glb`, size];
const jobs = [
  K('CarConcept', 1024), K('SheenChair', 512), K('GlamVelvetSofa', 1024), K('SheenWoodLeatherSofa', 1024), K('ChairDamaskPurplegold', 512),
  K('Lantern', 512), K('BarramundiFish', 512), K('Fox', 512), K('BoomBox', 512), K('WaterBottle', 256), K('DiffuseTransmissionPlant', 512),
  K('CommercialRefrigerator', 1024), K('AntiqueCamera', 512),
  ...['Deer', 'Stag', 'Fox', 'Wolf', 'Horse', 'Cow', 'Bull'].map((n) => Q('animals_pack', n)),
  ...['Bow_Wooden', 'Bow_Wooden2', 'Arrow'].map((n) => Q('medieval_weapons_pack', n)),
];
const ls = (d) => { try { return fs.readdirSync(path.join(dl, 'quaternius-showcase/public/glb', d)); } catch (e) { return []; } };
for (const f of ls('fish_pack').filter((n) => /^(Fish|Shark)/.test(n))) jobs.push(Q('fish_pack', f.replace('.glb', '')));
for (const f of ls('house_interior_pack')) jobs.push(Q('house_interior_pack', f.replace('.glb', '')));
// firearms (Quaternius Survival + Modular Sci-Fi Guns packs) and armour (Tank pack)
for (const f of ls('survival_pack')) jobs.push(Q('survival_pack', f.replace('.glb', '')));
for (const f of ls('modular_sci_fi_guns_pack')) jobs.push(Q('modular_sci_fi_guns_pack', f.replace('.glb', '')));
for (const f of ls('tank_pack')) jobs.push(Q('tank_pack', f.replace('.glb', '')));

let total = 0;
for (const [src, rel, size] of jobs) {
  if (!fs.existsSync(src)) continue; // pack only what was downloaded this run
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const doc = await io.read(src);
  // Khronos logos are trademarks: drop the logo textures from the concept car's plate/emblem
  for (const m of doc.getRoot().listMaterials()) {
    if (/license/i.test(m.getName())) { m.setBaseColorTexture(null); m.setEmissiveTexture(null); m.setBaseColorFactor([0.85, 0.86, 0.88, 1]); }
  }
  for (const n of doc.getRoot().listNodes()) if (/Emblem/i.test(n.getName())) n.setMesh(null);
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(dst, doc);
  total += fs.statSync(dst).size;
}
console.log(jobs.length, 'models,', (total / 1048576).toFixed(1), 'MB');
