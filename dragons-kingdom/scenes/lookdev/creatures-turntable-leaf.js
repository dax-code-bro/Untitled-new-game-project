// Leaf (0-3 leaf-abby | 3-6 leaf-sit-alt | 6-9 leaf-landing | 9-12 leaf-fire-lookdev | 12-15 pair-flight | 15-18 head-in-mouth s; the last two build Charcoal too) - see creatures-shots.js. Builds just what these shots need, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-leaf.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['leaf-abby', 'leaf-sit-alt', 'leaf-landing', 'leaf-fire-lookdev', 'pair-flight', 'head-in-mouth'], title: 'Dragon hero shots: Leaf' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
