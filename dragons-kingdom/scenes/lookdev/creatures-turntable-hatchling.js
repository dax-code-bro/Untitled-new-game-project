// Gold hatchling only (shots: hatchling-macro) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-hatchling.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['hatchling-macro'], title: 'Creature hero shots: Gold hatchling (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
