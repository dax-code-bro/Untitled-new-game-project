// Shot director - GROUND STAGING helpers (pure JS, no three.js: Node and browser). Engine phase 4
// (engine/DESIGN.md 3.3): the blocking pieces the auto-stager writes and a hand-written spec may use.
// CLING frame conventions: +x east, -z north, y up; a HEADING is degrees, 0 = facing north (-z), 90 = east
// (the director's `face: <number>`); `from` (framing.js) uses the same compass: the side the camera stands on.
//
//   place(where, { mark, how, sheet, how2, side, slot })  -> { at, face, y?, posture?, look?, lookAmount? }
//   walkTo(t, to, { speed, stop, face })                   -> a `walk` act
//   postureFor(words)                                      -> { posture } from 'kneeling' / 'seated' / ...
//   reachTo(t, side, at, { hold })                          -> a `reach` act
//   lookAtEvent(t, at, { amount, lead })                    -> a `look` act at t - lead (people react a beat early)
export const D2R = Math.PI / 180;
export const r2 = (x) => Math.round(x * 100) / 100;
export const r3 = (x) => Math.round(x * 1000) / 1000;
/** unit [x, z] of a compass heading (0 = north = -z) */
export const dirOf = (deg) => [Math.sin(deg * D2R), -Math.cos(deg * D2R)];
/** compass heading from a to b ([x, z] or [x, y, z]) */
export const headingTo = (a, b) => {
  const A = a.length === 3 ? [a[0], a[2]] : a, B = b.length === 3 ? [b[0], b[2]] : b;
  return norm360(Math.atan2(B[0] - A[0], -(B[1] - A[1])) / D2R);
};
export const norm360 = (d) => ((d % 360) + 360) % 360;
/** signed smallest difference a - b in degrees (-180..180] */
export const angDiff = (a, b) => { const d = norm360(a - b); return d > 180 ? d - 360 : d; };
const xz = (p) => (p.length === 3 ? [p[0], p[2]] : p);
const add = (p, d, k) => [r2(p[0] + d[0] * k), r2(p[1] + d[1] * k)];

/**
 * Where a person stands for a place word. where: [x, y, z] of the mark; how: 'work' (behind a counter that faces
 * `how2.face`), 'front' (a customer), 'seat' (on a round rim: how2.seat { r, y }, at heading `side`), 'on' (on a raised
 * mark: y = its height), 'below' (on the ground in front of a raised mark, how2.below metres toward `side`), 'inside'
 * (behind a doorway facing out), 'door' (on the step of a doorway), 'carry' (one of two carrying a long load; slot 0 / 1),
 * or 'near' (default: 1.2 m from the mark toward `side`, facing it).
 */
export function place(where, o = {}) {
  const how = o.how || 'near', h = o.how2 || {}, side = o.side ?? 180, p = xz(where);
  const face = h.face ?? null;
  switch (how) {
    case 'work': return { at: add(p, dirOf((face ?? 180) + 180), h.work ?? 1.2), face: face ?? 180 };
    case 'front': return { at: add(p, dirOf(face ?? 180), h.front ?? 1.4), face: norm360((face ?? 180) + 180) };
    case 'seat': { const s = h.seat || { r: 1, y: 0.45 }; return { at: add(p, dirOf(side), s.r), face: r2(norm360(side)), y: s.y, posture: { sit: 1 }, legs: 'planted' }; }
    case 'on': return { at: [r2(p[0]), r2(p[1])], face: r2(norm360(side)), y: r2(where[1] ?? 0) };
    case 'below': return { at: add(p, dirOf(side), h.below ?? 4), face: r2(norm360(side + 180)) };
    case 'inside': return { at: add(p, dirOf((face ?? 0) + 180), h.inside ?? 1.5), face: face ?? 0 };
    case 'door': return { at: add(p, dirOf(face ?? 0), h.door ?? 0.3), face: face ?? 0 };
    case 'carry': { const c = h.carry || { dir: 90, gap: 3 }; const k = (o.slot ?? 0) ? -c.gap / 2 : c.gap / 2; return { at: add(p, dirOf(c.dir), k), face: c.dir, legs: 'planted' }; }
    default: return { at: add(p, dirOf(side), h.near ?? 1.2), face: r2(norm360(side + 180)) };
  }
}

/** a walk act: to [x, z]; the director's walk profile does the rest */
export const walkTo = (t, to, o = {}) => [r2(t), 'walk', { to: xz(to).map(r2), speed: o.speed ?? 1.15, ...(o.stop != null ? { stop: o.stop } : { stop: 0.4 }), ...(o.face != null ? { face: o.face } : {}) }];
/** posture from words ('kneels', 'seated', 'crouching', 'bowed', 'leaning') */
export function postureFor(words = '') {
  const w = String(words).toLowerCase(), p = {};
  if (/\b(kneel|kneels|kneeling|wedges?)\b/.test(w)) Object.assign(p, { kneel: 1, bow: 0.4 });
  if (/\b(sit|sits|sitting|seated|on the (fountain )?rim)\b/.test(w)) p.sit = 1;
  if (/\b(crouch|crouches|crouching|stoops)\b/.test(w)) p.crouch = 0.6;
  if (/\b(bow|bows|bowed)\b/.test(w)) p.bow = 0.5;
  if (/\b(lean|leans|leaning)\b/.test(w)) p.lean = 0.5;
  return Object.keys(p).length ? p : null;
}
export const reachTo = (t, side, at, o = {}) => [r2(t), 'reach', { side, at: Array.isArray(at) ? at.map(r2) : at, in: o.in ?? 0.35, hold: o.hold ?? 0.6, out: o.out ?? 0.35 }];
export const lookAtEvent = (t, at, o = {}) => [r2(Math.max(0, t - (o.lead ?? 0.4))), 'look', { at: Array.isArray(at) ? at.map(r2) : at, amount: o.amount ?? 0.8, blend: o.blend ?? 0.4 }];
/** a gesture overlay act (nod / headShake / wave / point / raiseHand) */
export const gesture = (t, name, o = {}) => [r2(t), name, { in: 0.2, hold: o.hold ?? 0.4, out: 0.25, ...(o.side ? { side: o.side } : {}), ...(o.at ? { at: o.at } : {}) }];
