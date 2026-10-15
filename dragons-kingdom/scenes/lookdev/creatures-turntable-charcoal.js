// Charcoal only (0-3 charcoal-front | 3-6 charcoal-head | 6-10 charcoal-takeoff | 10-13 charcoal-fire s) - see creatures-shots.js. Builds just what these shots need, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-charcoal.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['charcoal-front', 'charcoal-head', 'charcoal-takeoff', 'charcoal-fire'], title: 'Dragon hero shots: Charcoal' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
