// Charcoal only (0-3 charcoal-front | 3-6 charcoal-head | 6-9 charcoal-flight s) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-charcoal.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['charcoal-front', 'charcoal-head', 'charcoal-flight'], title: 'Creature hero shots: Charcoal (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
