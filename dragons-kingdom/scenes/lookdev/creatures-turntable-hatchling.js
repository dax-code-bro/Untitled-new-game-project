// Gold hatchling only (0-3 hatchling-macro s) - see creatures-shots.js. Builds just what these shots need, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-hatchling.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['hatchling-macro'], title: 'Dragon hero shots: the gold hatchling' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
