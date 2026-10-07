// Leaf only (0-3 leaf-abby | 3-6 leaf-flight s) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-leaf.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['leaf-abby', 'leaf-flight'], title: 'Creature hero shots: Leaf (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
