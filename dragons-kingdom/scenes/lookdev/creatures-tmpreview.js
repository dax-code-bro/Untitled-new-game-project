// temporary review scene (scratch) - not committed
import { makeTurntable } from './creatures-shots.js';
const T = makeTurntable({ only: ['starlight-below','hatchling-macro','scout-bank','scout-wingloss'], step: 1, title: 'tmp review' });
export const meta = T.meta;
export const setup = T.setup;
export const update = T.update;
