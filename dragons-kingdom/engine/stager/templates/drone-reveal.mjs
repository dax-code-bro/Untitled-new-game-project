// drone-reveal (X6-02/03, X4-14): an aerial drift on a PLACE with no cast (the gap, the mist, the palace): a drone rig
// from the sun side, 35 mm f/8, a slow 4 % push; ~34 m of frame (WS) or ~100 m (EWS) at the place (mined look_frame_h_m).
import { distFor } from './common.mjs';
export const name = 'drone-reveal';
export function params(I, B) {
  const mm = I.mm || 35;
  const dist = distFor(I.size === 'EWS' ? 100 : 34, mm);
  return { kind: 'drone', mm, fstop: 8, rel: 0, dist, rise: dist * Math.tan((8 * Math.PI) / 180), push: 0.04 };
}
