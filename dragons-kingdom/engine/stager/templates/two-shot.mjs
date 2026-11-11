// two-shot: A on screen left, B on the right (X5-14, R3-03, X6-17): the camera on the side of the A-B line that
// gives that order, turned toward A's face; 50 mm f/4.5; both heads inside the middle 60 % of the frame width.
import { distFor } from './common.mjs';
export const name = 'two-shot';
export function params(I, B) {
  // two people far apart ("calls across"): a wider lens keeps the camera inside the set
  const mm = B.extent > 5 && !I.mmLocked ? 35 : I.mm || 50;
  const fh = Math.max(1.32, B.extent / 1.78 / (B.extent > 5 ? 0.8 : 0.55));
  return { rig: 'static', mm, fstop: 4.5, from: B.pairFrom ?? B.facingFrom, dist: distFor(fh, mm), height: B.eyeY };
}
