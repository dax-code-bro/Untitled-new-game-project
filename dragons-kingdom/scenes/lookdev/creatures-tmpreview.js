// temporary review scene (scratch) - not committed
import { makeTurntable } from './creatures-shots.js';
const T = makeTurntable({ only: ['charcoal-flight','leaf-flight'], step: 1, title: 'tmp review' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
