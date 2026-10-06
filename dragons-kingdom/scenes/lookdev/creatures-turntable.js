// Episode 1 creatures - look-development turntable (PROVISIONAL designs).
// Every shot of creatures-shots.js in sequence:
//   0-10 Charcoal + Remi | 10-14 Charcoal head | 14-20 Charcoal flight
//   20-30 Leaf sitting, Abby in front | 30-34 Leaf eye | 34-40 Leaf flight
//   40-50 Starlight gliding (backlit from below) | 50-58 gold hatchling
//   58-64 Slitherwing scout | 64-70 scout loses its LEFT wing | 70-80 scale lineup
//
//   node render/render.mjs --still scenes/lookdev/creatures-turntable.js --time 3 --preset final --png out.png
// Faster single-subject stills: creatures-turntable-<name>.js.
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable();
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
