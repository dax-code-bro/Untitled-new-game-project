// Episode 1 creatures - hero look-development shots (PROVISIONAL designs), every shot of
// creatures-shots.js in sequence (see SHOTS there for the list and the camera setups):
//   0-3 Charcoal 3/4 front with Remi | 3-6 Charcoal's head | 6-9 Charcoal flying side-on
//   9-12 Leaf sitting upright, Abby beside him | 12-15 Leaf flying with Abby
//   15-18 Starlight gliding overhead, seen from the ground | 18-21 Charcoal's fire (orange-red)
//   21-24 Leaf's fire (purplish-blue) | 24-27 gold hatchling macro on the nest
//   27-30 the scout banking | 30-34 the scout loses its LEFT wing
//   node render/render.mjs --still scenes/lookdev/creatures-hero.js --time 1 --preset final --png out.png
// Fast check of every shot (1 s each): creatures-review.js. Contact sheet: creatures-contact.js.
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ title: 'Creature hero shots (provisional designs)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
