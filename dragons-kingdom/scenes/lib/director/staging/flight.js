// Shared FLIGHT staging helpers (engine/DESIGN.md 3.3; engine phase 5). Pure: no three.js, no files.
// Mined from the hand-written air specs (verdor-aerial / sky-off-verdor / outer-rocks .spec.js), where each was a
// local copy. Frame: VERDOR (+x east, -z north, y up, metres); a HEADING is a compass bearing (0 = north, 90 = east).
// The hand specs keep their own copies (Episode 1 is frozen); new specs import these.
export const D2R = Math.PI / 180;
export const V = 16;                                    // formation cruise speed, m/s (1C: zF(T) = 300 + 16 T)
const r2 = (v) => Math.round(v * 100) / 100;
const n360 = (a) => ((a % 360) + 360) % 360;

/** forward / left / right unit vectors (x, z) of a heading */
export function localFrame(h) {
  const f = [Math.sin(h * D2R), -Math.cos(h * D2R)];
  return { f, l: [-Math.cos(h * D2R), -Math.sin(h * D2R)], r: [Math.cos(h * D2R), Math.sin(h * D2R)] };
}
/** straight flight from p0 on heading h at v m/s for dur s, climbing dy: { root, yawKeys } (cast entry fields) */
export function fly(p0, h, v, dur, dy = 0) {
  const { f } = localFrame(h);
  return { root: [[0, p0.map(r2)], [r2(dur), [r2(p0[0] + f[0] * v * dur), r2(p0[1] + dy), r2(p0[2] + f[1] * v * dur)], 'linear']], yawKeys: r2(n360(h)) };
}
/** the 1C formation on the z clock: x / y fixed, `lead` m ahead, from formation time T0 for dur s (heading 180) */
export const inForm = (x, y, lead, T0, dur, o = {}) => ({
  root: [[0, [x, y, 300 + V * T0 + lead]], [dur, [x + (o.dx || 0), y + (o.dy || 0), 300 + V * (T0 + dur) + lead + (o.dlead || 0)], 'linear']],
  yawKeys: o.heading ?? 180,
});
/** the TALK formation on any heading: the leader at p, the wingman `lat` m to its LEFT, `lead` m ahead, 2 m lower */
export function pair(p, h, dur, o = {}) {
  const { f, l } = localFrame(h);
  const lat = o.lat ?? 30, lead = o.lead ?? 16;
  const c0 = [p[0] + l[0] * lat + f[0] * lead, p[1] + (o.cdy ?? -2), p[2] + l[1] * lat + f[1] * lead];
  const [a, b] = o.names || ['leaf', 'charcoal'];
  return { [a]: fly(p, h, o.v ?? V, dur, o.dy || 0), [b]: fly(c0, h, o.v ?? V, dur, o.dy || 0) };
}
/** position on a 2-key (or n-key, linear) root at time t */
export function posAt(fl, t) {
  const R = fl.root;
  if (!Array.isArray(R[0]?.[1])) return R;                    // a fixed root [x, y, z]
  if (t <= R[0][0]) return R[0][1].slice();
  for (let i = 1; i < R.length; i++) {
    const [t0, a] = R[i - 1], [t1, b] = R[i];
    if (t <= t1) { const k = (t - t0) / ((t1 - t0) || 1); return a.map((v, j) => v + (b[j] - v) * k); }
  }
  return R[R.length - 1][1].slice();
}
/** the sun's shadow-box centre for a flyer at p: the ray from p away from the sun meets the plane y = yPlane */
export function shadowOf(p, sun = [0.838, 0.515, 0.178], yPlane = 20) {
  const k = (p[1] - yPlane) / (sun[1] || 1e-3);
  return [r2(p[0] - sun[0] * k), yPlane, r2(p[2] - sun[2] * k)];
}
/** shadowAt keys following a flight */
export const shTrack = (fl, sun, yPlane) => fl.root.map(([t, p, e]) => (e ? [t, shadowOf(p, sun, yPlane), e] : [t, shadowOf(p, sun, yPlane)]));

// ---- beat presets (creatures library `flight` / `glide` acts). CHAR_HZ is LOCKED: the sound spots time Charcoal's
// wingbeats at one beat per 1.6 s (0.16 / 1.76 / 3.36 ...). Do not change it without telling sound.
export const CHAR_HZ = 0.625;
export const LEAF_FLY = (o = {}) => [[0, 'flight', { corr: 1, ...o }]];
export const LEAF_SKIM = (o = {}) => [[0, 'flight', { corr: 1, hz: 1.4, amp: 0.55, ...o }]];   // short beats: tips clear the water
export const CHAR_FLY = (o = {}) => [[0, 'flight', { hz: CHAR_HZ, amp: 0.68, ...o }]];
export const CHAR_GLIDE = (o = {}) => [[0, 'glide', { bank: 0.03, dihedral: 0.08, droop: 0.06, ...o }]];
/** the beat preset for a creature id and a way of flying ('fly' | 'skim' | 'glide') */
export function beatFor(id, how = 'fly', o = {}) {
  const big = id === 'charcoal';
  if (how === 'glide') return CHAR_GLIDE(o);
  if (how === 'skim' && !big) return LEAF_SKIM(o);
  return big ? CHAR_FLY(o) : LEAF_FLY(o);
}
/** a creature settled on a perch (a stack top, the quay): a fixed root, its heading, a low crouch */
export const perch = (at, face, o = {}) => ({ root: [[0, at.map(r2)]], yawKeys: r2(n360(face)), acts: [[0, 'crouch', { k: o.k ?? 0.35, ...(o.acts || {}) }]] });

// ---- the formation clock: a scene's flight runs on ONE clock through every shot (the edit compresses time, the map
// stays continuous). formationClock(path, { v, s0 }) -> { at(T) -> { p, heading, s } }: arc length s0 + v T along the
// polyline `path` ([[x, y, z], ...]); past its end it carries on along the last leg.
export function formationClock(path, { v = V, s0 = 0 } = {}) {
  const legs = [];
  let L = 0;
  for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; const d = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1e-6; legs.push({ a, b, s: L, d }); L += d; }
  return {
    length: L,
    at(T) {
      const s = s0 + v * T;
      const g = legs.find((q) => s <= q.s + q.d) || legs[legs.length - 1];
      const k = (s - g.s) / g.d;
      const p = g.a.map((x, j) => x + (g.b[j] - x) * k);
      return { p: p.map(r2), heading: r2(n360(Math.atan2(g.b[0] - g.a[0], -(g.b[2] - g.a[2])) / D2R)), s: r2(s) };
    },
  };
}
/** the camera's bearing relative to a flyer's heading (0 = dead ahead, 90 = its right, 180 = behind, 270 = its left) */
export const relBearing = (camFrom, heading) => n360(camFrom - heading);
