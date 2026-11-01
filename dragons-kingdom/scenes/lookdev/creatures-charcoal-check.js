// Charcoal's two approved hero shots (charcoal-front, charcoal-head) only, 1 s each, for quick
// material regression checks against output/dragons-wyvern/fix1b/hero (e.g. bodySpec / headCav):
//   node render/render.mjs scenes/lookdev/creatures-charcoal-check.js --preset preview --fps 1 --workers 1 --out DIR
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ step: 1, only: ['charcoal-front', 'charcoal-head'], title: 'Charcoal hero check (front + head)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
