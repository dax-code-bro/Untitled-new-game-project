// establish-wide: wide / EWS static ground (X5-02, X5-09, X4-07): a sheet vantage (or the preferred side), 35 mm f/8,
// camera 2-3 m up, ~8-9 m of frame height at the target (mined WS/establish-wide look_frame_h_m median 8.3).
import { distFor } from './common.mjs';
export const name = 'establish-wide';
export function params(I, B) {
  const mm = I.mm || 35;
  // people in it: the mined frame height AT the subject (6.9 m); things: at the aim point (8.3 m)
  const fh = I.size === 'EWS' ? 16 : Math.max(B.subjects.some((s) => s.actor) ? 6.9 : 8.3, B.extent / 1.78 * 1.25);
  return { rig: 'static', mm, fstop: 8, from: B.facingFrom, dist: Math.min(28, Math.max(10, distFor(fh, mm))), height: B.groundY + 2.2, vantage: true };
}
