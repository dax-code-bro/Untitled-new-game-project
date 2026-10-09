// The scout only (0-3 scout-bank | 3-7 scout-wingloss s) - see creatures-shots.js. Builds just this creature, so stills are quick.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable-scout.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['scout-bank', 'scout-wingloss'], title: 'Creature hero shots: the scout (provisional design)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
