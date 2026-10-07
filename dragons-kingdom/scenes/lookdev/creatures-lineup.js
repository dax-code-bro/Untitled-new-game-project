// Scale lineup (provisional "on-screen area" sizes from assets.json): Leaf 8 m,
// Charcoal 35.8 m, Starlight 50.6 m, and a 1.7 m person - see creatures-shots.js.
//   node render/render.mjs --still scenes/lookdev/creatures-lineup.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ only: ['lineup'], title: 'Creature scale lineup (provisional)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
