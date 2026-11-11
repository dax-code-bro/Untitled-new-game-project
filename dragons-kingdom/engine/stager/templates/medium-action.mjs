// medium-action: medium + people with acts (X5-04/06/08): 50 mm, camera ~1.6 m, three-quarter front of the main
// subject (its facing +- 25 deg toward the light); frame height from the mined MS band (median 1.64 m) or wider to
// hold the action (a walk, the work mark).
import { distFor } from './common.mjs';
export const name = 'medium-action';
export function params(I, B) {
  const mm = I.mm || 50;
  const body = B.subjects.some((s) => s.actor) ? Math.min(1, (B.eyeY - B.groundY) / 1.62) : 1;   // a seated person is shorter
  const fh = Math.max(1.64 * body, Math.min(3.4, B.extent / 1.78 * 1.15));
  return { rig: 'static', mm, fstop: 4, from: B.facingFrom, dist: distFor(fh, mm), height: B.eyeY + 0.05 };
}
