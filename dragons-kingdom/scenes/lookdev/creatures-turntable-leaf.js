// Leaf only (shots: leaf,leaf-eye,leaf-flight) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-leaf.js --time 2 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['leaf', 'leaf-eye', 'leaf-flight'], title: 'Creature turntable: Leaf (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
