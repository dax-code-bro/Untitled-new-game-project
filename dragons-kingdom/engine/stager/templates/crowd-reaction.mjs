// crowd-reaction: a crowd reacts (X4-07): extras on the area's slots look at the event at t +- 0.4 s, one in three
// raises a hand; the camera is an establish-wide on the event with the crowd between.
import { params as wide } from './establish-wide.mjs';
export const name = 'crowd-reaction';
export const params = (I, B) => ({ ...wide(I, B), crowd: true });
