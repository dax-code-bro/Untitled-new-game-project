// single-close: close + one person (1C-09, X6-10): 85 mm f/2.8, head at [+-0.1, 0.17], three-quarter front.
import { distFor } from './common.mjs';
export const name = 'single-close';
export function params(I, B) {
  const mm = I.mm || 85;
  return { rig: 'static', mm, fstop: 2.8, from: B.facingFrom, dist: distFor(0.95, mm), height: B.eyeY, headY: 0.17 };
}
