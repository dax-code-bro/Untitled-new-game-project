// ots: over the shoulder (1A-21/22), or a speaking face the episode's faces policy says to avoid: the camera behind
// the listener, the speaker's head at [0.25, 0.3], the listener's shoulder in the left foreground.
import { distFor } from './common.mjs';
export const name = 'ots';
export function params(I, B) {
  const mm = I.mm || 50;
  return { rig: 'static', mm, fstop: 4, from: B.behindListener ?? B.facingFrom, dist: distFor(1.5, mm), height: B.eyeY + 0.1, ots: true };
}
