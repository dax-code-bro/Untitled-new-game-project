// Episode 1 dragons (DESIGN.md: two legs, the wings are the front limbs, horns) - hero
// look-development shots, every shot of creatures-shots.js in sequence (SHOTS there has the
// camera setups):
//   0-3 Charcoal 3/4 front with Remi | 3-6 Charcoal's head | 6-10 Charcoal's take-off
//   10-13 Charcoal and Leaf side by side with riders | 13-16 the head-in-mouth hold (1D)
//   16-19 Leaf sitting upright, Abby beside him | 19-22 Charcoal's fire | 22-25 Leaf's fire
//   25-28 Starlight gliding, seen from the ground | 28-31 Starlight's dive (Queen Fall riding)
//   31-34 Queen Fall in the rig on Starlight (air to air) | 34-37 hatchling macro
//   37-40 the scout banking | 40-44 the scout loses its LEFT wing (seen from behind)
//   (rev. 2: Charcoal stands on his two legs, wings folded off the ground)
//   node render/render.mjs --still scenes/lookdev/creatures-hero.js --time 1 --preset final --png out.png
// Fast check of every shot (1 s each): creatures-review.js. Contact sheet: creatures-contact.js.
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ title: 'Dragon hero shots' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
