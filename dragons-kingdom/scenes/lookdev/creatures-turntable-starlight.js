// Starlight only (0-3 starlight-below | 3-6 starlight-dive s) - see creatures-shots.js. Builds just what these shots need, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-starlight.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['starlight-below', 'starlight-dive'], title: 'Dragon hero shots: Starlight' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
