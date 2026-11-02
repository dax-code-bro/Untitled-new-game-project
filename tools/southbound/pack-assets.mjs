// Packs the open-source (CC0) models Southbound uses into site/southbound/assets/.
//
// Sources (all CC0 / public domain):
//   Quaternius - Ultimate Modular Men & Women packs  (people)
//   Quaternius - Universal Animation Library         (animations)
//   Kenney     - Car Kit 3.1                          (vehicles)
//
//   node pack-assets.mjs <downloads-dir>
// where <downloads-dir> holds clones of:
//   github.com/trebeljahr/quaternius-showcase       -> quaternius-showcase/
//   github.com/J-Ponzo/gltf-universal-animation-library -> ual/
//   github.com/Arslan12216775/kenney_car-kit        -> carkit/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, quantize, resample } from '@gltf-transform/functions';

const here = path.dirname(fileURLToPath(import.meta.url));
const dl = path.resolve(process.argv[2] || '.');
const out = path.resolve(here, '../../site/southbound/assets');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const PEOPLE = {
  m_casual: 'modular_men/Casual', m_casual2: 'modular_men/Casual2', m_suit: 'modular_men/Suit',
  m_worker: 'modular_men/Worker', m_punk: 'modular_men/Punk', m_beach: 'modular_men/Beach', m_swat: 'modular_men/Swat',
  f_casual: 'modular_women/Casual', f_formal: 'modular_women/Formal', f_suit: 'modular_women/Suit',
  f_worker: 'modular_women/Worker', f_punk: 'modular_women/Punk',
};
const CARS = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'van', 'delivery',
  'truck', 'police', 'ambulance', 'firetruck', 'garbage-truck'];
export const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
  'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Driving_Loop',
  'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload', 'Punch_Jab', 'Punch_Cross',
  'Hit_Chest', 'Death01', 'Crouch_Idle_Loop', 'Sitting_Idle_Loop', 'Dance_Loop', 'Interact'];

async function pack(src, dst, opts = {}) {
  const doc = await io.read(src);
  if (opts.animationsOnly) {
    const root = doc.getRoot();
    for (const a of root.listAnimations()) if (!CLIPS.includes(a.getName())) a.dispose();
    for (const m of root.listMeshes()) m.dispose();
    for (const n of root.listNodes()) if (n.getMesh()) n.setMesh(null);
  }
  await doc.transform(dedup(), weld(), resample(), prune({ keepLeaves: true }));
  if (opts.quantize) await doc.transform(quantize({ quantizeNormal: 10, quantizePosition: 14 }));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  return fs.statSync(dst).size;
}

let total = 0;
for (const [id, p] of Object.entries(PEOPLE)) {
  total += await pack(path.join(dl, 'quaternius-showcase/public/glb', p + '.glb'), path.join(out, 'people', id + '.glb'), { quantize: true });
}
total += await pack(path.join(dl, 'ual/glTF/AnimationLibrary_Godot_Standard.gltf'), path.join(out, 'anims/ual.glb'), { animationsOnly: true });
for (const d of ['people', 'anims']) {
  for (const f of fs.readdirSync(path.join(out, d))) console.log(d + '/' + f, Math.round(fs.statSync(path.join(out, d, f)).size / 1024) + ' KB');
}
console.log('total', (total / 1048576).toFixed(2), 'MB');
