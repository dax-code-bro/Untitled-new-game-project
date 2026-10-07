// Starlight only (0-3 starlight-below s) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-starlight.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['starlight-below'], title: 'Creature hero shots: Starlight (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
