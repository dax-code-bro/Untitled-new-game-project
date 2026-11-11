// insert: insert / macro (X5-01, X5-05): 100 mm f/4, low (0.25-0.5 m over the target), 2.5-4.5 m away, focus on it.
import { distFor } from './common.mjs';
export const name = 'insert';
export function params(I, B) {
  const mm = I.mm || 100;
  return { rig: 'static', mm, fstop: 4, from: B.pref, dist: Math.max(2.5, Math.min(4.5, distFor(0.4, mm))), height: B.anchor[1] + (I.move.low ? 0.15 : 0.3) };
}
