// Every hero shot of creatures-shots.js for one second each (shot i at t = i, at the shot's
// representative moment), for review renders of all shots from one build:
//   node render/render.mjs scenes/lookdev/creatures-review.js --preset preview --fps 1 --workers 1 --cinematic preview --out output/cr/review
// (final 4K with the film finish: --preset final, no --cinematic option)
import { makeTurntable } from './creatures-shots.js';

const T = makeTurntable({ step: 1, title: 'Creature hero shots (review, 1 s per shot)' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
