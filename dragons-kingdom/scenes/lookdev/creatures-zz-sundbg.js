import { makeTurntable, SHOTS } from './creatures-shots.js';
const s = SHOTS.find((x) => x.id === 'charcoal-front');
s.cam = { ...s.cam, el: 80, dist: 2.5, az: 0 };
const T = makeTurntable({ only: ['charcoal-front'], quality: 'draft' });
export const meta = T.meta; export const setup = T.setup; export const update = T.update;
