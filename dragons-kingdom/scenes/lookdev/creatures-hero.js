// Episode 1 dragons (DESIGN.md: two legs, the wings are the front limbs, horns) - hero
// look-development shots, every shot of creatures-shots.js in sequence (SHOTS there has the
// camera setups, durations 3-4 s each):
//   Charcoal 3/4 front with Remi (the LOW stance) | Charcoal's head | the low walk side on |
//   resting (lying) | the take-off | Charcoal and Leaf side by side with riders | the
//   head-in-mouth hold (1D) | Leaf sitting like a dog, Abby beside him | Leaf landing |
//   Charcoal's fire | Leaf's fire | Starlight gliding seen from the ground | Starlight's dive
//   (Queen Fall riding) | Queen Fall in the rig on Starlight | the hatchling macro | the scout
//   banking | the scout loses its LEFT wing (seen from behind)
//   (rev. 3, Daxtyn 2026-10-16: the dragons stand low, legs under the middle of the body, the
//   folded wings' wrists down in front)
//   node render/render.mjs --still scenes/lookdev/creatures-hero.js --time 1 --preset final --png out.png
// Fast check of every shot (1 s each): creatures-review.js. Contact sheet: creatures-contact.js.
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ title: 'Dragon hero shots' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
