// camera-ship (1C-10, X6-01/16, X4-18/20, X6-05/19/20): a long lens riding with the formation, keyed with the flyers'
// midpoint at a fixed offset: `rel` deg off their heading on the line's camera side, far enough that every framed
// subject sits inside the middle 80 % of the width, and HIGH enough for the long-lens horizon rule
// (depression >= vfov/2 + 2.5 deg: no horizon line through a long-lens frame).
import { distFor, tanH } from './common.mjs';
import { riseForHorizon, lensOf } from '../air.mjs';
import { dirOf } from '../../../scenes/lib/director/staging/ground.js';
export const name = 'camera-ship';
export function params(I, B) {
  const mm = lensOf(I) >= 85 ? lensOf(I) : 160;
  // (phase 5b) a prior vantage (another shot's hand camera of the same class) gives the bearing and the frame height
  const rel = B.prior ? B.prior.rel : I.size === 'EWS' ? 165 : 90;
  const Lmax = Math.max(9, ...B.subjects.map((s) => s.L || 0));
  const fh = B.prior ? B.prior.fh : I.size === 'EWS' ? 6.5 * Lmax : I.size === 'WS' ? 2.2 * Lmax : 2 * Lmax;
  // the subjects' spread across the view
  const d = dirOf(B.hMid + rel), r = [-d[1], d[0]];
  const xs = B.subjects.filter((s) => s.p && s.w >= 1).map((s) => s.p[0] * r[0] + s.p[2] * r[1]);
  const spread = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
  const dist = Math.max(distFor(fh, mm), spread / (0.8 * 2 * tanH(mm)) * 1.1);
  return { kind: 'ship', mm, fstop: 8, rel, dist, rise: riseForHorizon(dist, mm), both: true };
}
