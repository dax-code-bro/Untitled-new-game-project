// Kept for older notes and commands: the creature hero shots now live in creatures-hero.js
// (every shot in sequence) - this file is the same scene.
//   node render/render.mjs --still scenes/lookdev/creatures-turntable.js --time 1 --preset final --png out.png
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ title: 'Creature hero shots (provisional designs)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
