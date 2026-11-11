// air-to-air (X6-08/13, 1C-07, X4-12/16/17/19): the stage's framing solver tracking a rider's head or a flyer's chest,
// from a bearing RELATIVE to the flyer's heading on the camera side of the flight line (right: 0..180), rising a
// little over it. Mined (templates.mined.json, the 1C X4 / X6 air-to-air shots): CU 85 mm ~1.0 m of frame at the rider
// (bearing 20-35), MS 50 mm ~2 m (bearing 30-50), WS a frame of ~1.3 creature lengths from the side (bearing 70-115),
// EWS a long lens from behind (bearing 160-175). A long lens keeps the horizon rule (depression >= vfov/2 + 2.5).
import { distFor } from './common.mjs';
import { riseForHorizon, lensOf } from '../air.mjs';
export const name = 'air-to-air';
export function params(I, B) {
  const m = B.main, rider = !!B.castDefs[m.actor]?.ride, L = m.L || 9;
  const T = { CU: [85, rider ? 1.0 : 0.3 * L, 30, 0.4], MS: [50, rider ? 2.0 : 0.6 * L, 35, 1.0], WS: [100, 1.3 * L, 100, null], EWS: [160, 7 * L, 165, null] }[I.size] || [50, 2, 35, 1];
  const mm = lensOf(I) || B.prior?.mm || T[0];
  // (phase 5b) a prior vantage (another shot's hand camera of the same class): its relative bearing and frame height
  if (B.prior) { T[2] = B.prior.rel; T[1] = B.prior.fh; }
  const dist = distFor(T[1], mm);
  let rise = T[3] ?? dist * Math.tan((6 * Math.PI) / 180);
  if (mm >= 100) rise = Math.max(rise, riseForHorizon(dist, mm));
  return { kind: 'frame', mm, fstop: mm >= 85 ? 5.6 : 4, rel: T[2], dist, rise };
}
