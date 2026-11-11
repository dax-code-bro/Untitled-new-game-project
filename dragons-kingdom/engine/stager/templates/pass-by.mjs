// pass-by (X6-09, X4-10): a static camera at the place the move names ("static inside the gap", "on a lower stack"),
// aimed where the flyer is at mid-shot, the focus pulled far -> near as it passes. Without a place in the move it is an
// air-to-air from just ahead of the flyer's line.
import { distFor } from './common.mjs';
export const name = 'pass-by';
export function params(I, B) {
  const mm = I.mm || 35;
  if (B.movePlace) return { kind: 'static', mm, fstop: 8, up: 1.6, dist: 40, rise: 2, rel: 0 };
  return { kind: 'frame', mm, fstop: 5.6, rel: 20, dist: distFor(1.6 * (B.main.L || 9), mm), rise: 2 };
}
