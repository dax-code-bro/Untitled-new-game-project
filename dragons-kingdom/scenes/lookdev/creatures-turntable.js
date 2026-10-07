// Episode 1 creatures - hero look-development shots (PROVISIONAL designs).
// Every shot of creatures-shots.js in sequence (seconds):
//   0-4 Charcoal 3/4 front with Remi | 4-7 Charcoal head | 7-10 Charcoal flying side-on
//   10-14 Leaf sitting upright, Abby beside him | 14-17 Leaf flying with Abby
//   17-20 Starlight gliding seen from the ground | 20-23 Starlight side-on
//   23-26 gold hatchling macro on bedding | 26-29 Slitherwing scout banking
//   29-33 the scout loses its LEFT wing | 33-36 scale lineup with a person
//
//   node render/render.mjs --still scenes/lookdev/creatures-turntable.js --time 1 --preset final --png out.png
// Faster single-subject stills: creatures-turntable-<name>.js; the all-creature contact
// sheet under neutral daylight: creatures-contact.js.
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable();
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
