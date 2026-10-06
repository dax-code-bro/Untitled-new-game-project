// Starlight only (shots: starlight) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-starlight.js --time 2 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['starlight'], title: 'Creature turntable: Starlight (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
