// Shot director - BLOCKING: where every actor is, which way they face and what they are doing,
// as a pure function of the shot time t (no state carried between frames).
//
// An actor's part of a shot spec:
//   alexandria: {
//     at: [x, z] | 'mark',            start mark (y comes from the set's ground)
//     face: degrees | 'mark' | [x, z] start facing (degrees: 0 = facing NORTH (-z), 90 = EAST (+x))
//     acts: [                          timed actions, in order (times = shot seconds)
//       [0.0, 'stand'],
//       [0.8, 'walk', { to: 'nest' | [x, z], path: [[x, z], ...], speed: 1.3, stop: 0.3, face: 'egg' }],
//       [3.0, 'turn', { to: 'door' | degrees, dur: 0.8 }],
//       [3.2, 'crouch', { dur: 1.0 }]  /  'kneel' / 'sit' / 'rise' / 'bow' (posture, 0..1 ramps)
//       [4.0, 'raiseHand', { side: 'R', in: 0.3, hold: 0.8, out: 0.4 }]   (overlays: arms, head)
//       [5.0, 'look', { at: 'hatchling.head', amount: 0.9 }],
//     ],
//     look: 'nest',                    default eye-line (overridden by 'look' acts)
//   }
// Overlays (raiseHand, point, reach, gesture, handsTo, carry, cradle, shove, touch, nod, headShake,
// breathe) blend in and out on top of the base state; posture acts (crouch, kneel, sit, bow, rise)
// ramp a value; walk / turn move the root. actions.js turns the state into bone rotations.
import { clamp, ease, lerp, keyed } from './timeline.js';

export const POSTURES = ['crouch', 'kneel', 'sit', 'bow', 'lean'];
const MOVES = new Set(['walk', 'run', 'hurry', 'turn', 'place']);
export const OVERLAYS = new Set(['raiseHand', 'point', 'reach', 'gesture', 'handsTo', 'carry', 'cradle', 'shove', 'touch', 'nod', 'headShake', 'clasp', 'hold', 'wave']);

const D2R = Math.PI / 180;
/** degrees (0 = north/-z, 90 = east/+x) -> three.js yaw (rotation about +y; 0 = facing +z) */
export const yawFromHeading = (deg) => Math.PI - deg * D2R;
export const headingFromYaw = (yaw) => (Math.PI - yaw) / D2R;
/** yaw that faces from (x0, z0) toward (x1, z1) */
export const yawToward = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A polyline path with arc-length lookup. pts: [[x, z], ...] */
export function makePath(pts) {
  const P = pts.map((p) => [p[0], p[1]]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = (s) => {
    s = clamp(s, 0, L);
    let i = 1;
    while (i < P.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const u = (s - cum[i - 1]) / seg;
    return [lerp(P[i - 1][0], P[i][0], u), lerp(P[i - 1][1], P[i][1], u)];
  };
  // the walking direction at s, smoothed over a window (corners are rounded, not snapped)
  const dir = (s, win = 0.35) => {
    const a = at(Math.max(0, s - win)), b = at(Math.min(L, s + win));
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const n = Math.hypot(dx, dz);
    if (n < 1e-6) { const k = P.length - 1; const ex = P[k][0] - P[Math.max(0, k - 1)][0], ez = P[k][1] - P[Math.max(0, k - 1)][1]; const m = Math.hypot(ex, ez) || 1; return [ex / m, ez / m]; }
    return [dx / n, dz / n];
  };
  return { pts: P, length: L, at, dir };
}

/**
 * Distance travelled after time dt on a walk of length L at cruise speed v, accelerating over
 * `acc` seconds and decelerating over `dec` seconds (a smooth start and a smooth stop).
 * Returns { s, v (current speed), done, T (total duration) }.
 */
export function walkProfile(dt, L, v, acc = 0.45, dec = 0.5) {
  if (L <= 1e-6) return { s: 0, v: 0, done: true, T: 0 };
  // distance covered while accelerating / decelerating at an average of v/2
  let va = v, da = (v * acc) / 2, dd = (v * dec) / 2;
  if (da + dd > L) { const k = Math.sqrt(L / (da + dd)); va = v * k; da *= k * k; dd *= k * k; acc *= k; dec *= k; }
  const cruise = (L - da - dd) / va;
  const T = acc + cruise + dec;
  if (dt <= 0) return { s: 0, v: 0, done: false, T };
  if (dt < acc) return accel(dt, acc, va, T);
  if (dt < acc + cruise) return { s: da + (dt - acc) * va, v: va, done: false, T };
  if (dt < T) { const u = (dt - acc - cruise) / dec; return { s: L - dd + va * dec * (u - u * u * u + u * u * u * u / 2), v: va * (1 - smoothRamp(u)), done: false, T }; }
  return { s: L, v: 0, done: true, T };
}
// speed ramps up as smoothstep; distance is its integral: v*acc*(u^3 - u^4/2)
function smoothRamp(u) { return u * u * (3 - 2 * u); }
function accel(dt, acc, va, T) { const u = dt / acc; return { s: va * acc * (u * u * u - u * u * u * u / 2), v: va * smoothRamp(u), done: false, T }; }

/** Overlay weight: ramp in over `in`, hold, ramp out over `out` (hold = Infinity: stays). */
export function envelope(dt, o = {}) {
  const tin = o.in ?? 0.35, hold = o.hold ?? Infinity, tout = o.out ?? 0.4;
  if (dt < 0) return 0;
  if (dt < tin) return ease('smooth', dt / tin);
  if (dt < tin + hold) return 1;
  const u = (dt - tin - hold) / tout;
  return u >= 1 ? 0 : 1 - ease('smooth', u);
}

/**
 * The base state of an actor at shot time t from its spec (pure).
 * env: { mark(name) -> [x, y, z] | null, ground(x, z) -> y }
 * Returns { x, z, y, yaw, speed, dist (metres walked in the shot so far: drives the gait phase),
 *   moving (0..1 gait weight), posture: { crouch, kneel, sit, bow, lean }, overlays: [{ name, w, o }],
 *   look: { at, amount } | null, walkHeading }
 */
export function actorState(spec, t, env) {
  const P = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { const m = env.mark(v); if (!m) throw new Error(`blocking: unknown mark "${v}"`); return [m[0], m[2]]; }
    if (Array.isArray(v) && v.length === 3) return [v[0], v[2]];
    return v;
  };
  const faceYaw = (f, x, z) => {
    if (f == null) return null;
    if (typeof f === 'number') return yawFromHeading(f);
    const p = P(f);
    return yawToward(x, z, p[0], p[1]);
  };
  const st0 = P(spec.at) || [0, 0];
  const s = { x: st0[0], z: st0[1], yaw: faceYaw(spec.face, st0[0], st0[1]) ?? 0, speed: 0, dist: 0, moving: 0, posture: { crouch: 0, kneel: 0, sit: 0, bow: 0, lean: 0 }, overlays: [], look: spec.look ? { at: spec.look, amount: spec.lookAmount ?? 0.85 } : null, walkHeading: null };
  if (spec.posture) Object.assign(s.posture, spec.posture);
  const acts = (spec.acts || []).slice().sort((a, b) => a[0] - b[0]);
  // an act runs until the next act of its own CHANNEL starts (a walk is cut by the next walk / turn,
  // a crouch ramp by the next posture act - a raised hand or a turn of the head cuts neither)
  const channel = (n) => (OVERLAYS.has(n) ? `ov:${n}` : n === 'look' ? 'look' : MOVES.has(n) ? 'move' : POSTURES.includes(n) || n === 'rise' ? 'posture' : n === 'hide' || n === 'show' ? 'vis' : 'base');
  for (let i = 0; i < acts.length; i++) {
    const [t0, name, o = {}] = acts[i];
    if (t0 > t) break;
    const ch = channel(name);
    let tNext = Infinity;
    for (let j = i + 1; j < acts.length; j++) if (channel(acts[j][1]) === ch) { tNext = acts[j][0]; break; }
    const tEnd = Math.min(t, OVERLAYS.has(name) || name === 'look' ? t : tNext);
    const dt = tEnd - t0;
    if (OVERLAYS.has(name)) { s.overlays.push({ name, w: envelope(t - t0, o), o, t0, dt: t - t0 }); continue; }
    switch (name) {
      case 'stand': case 'hold': case 'idle': break;
      case 'look': s.look = o.at == null ? null : { at: o.at, amount: o.amount ?? 0.85, t0, blend: o.blend ?? 0.5 }; break;
      case 'place': { const p = P(o.at); if (p) { s.x = p[0]; s.z = p[1]; } const y = faceYaw(o.face, s.x, s.z); if (y != null) s.yaw = y; break; }
      case 'walk': case 'run': case 'hurry': {
        const pts = [[s.x, s.z], ...((o.path || [o.to]).map(P))];
        const path = makePath(pts);
        const v = o.speed ?? (name === 'run' ? 3.2 : name === 'hurry' ? 1.8 : 1.25);
        const pr = walkProfile(dt, path.length, v, o.acc ?? 0.45, o.stop ?? 0.5);
        const p = path.at(pr.s);
        const d = path.dir(pr.s);
        const yWalk = Math.atan2(d[0], d[1]);
        s.x = p[0]; s.z = p[1];
        s.dist += pr.s;
        s.speed = pr.v;
        s.moving = clamp(pr.v / Math.max(0.3, v * 0.35));
        // turning into the walk: the body turns toward the path over the first 0.4 s
        const startYaw = s.yaw;
        const turnIn = ease('smooth', clamp(dt / 0.4));
        s.yaw = startYaw + wrapAngle(yWalk - startYaw) * turnIn;
        s.walkHeading = yWalk;
        // arrival: turn to face o.face (over 0.6 s after stopping)
        if (pr.done && o.face != null) {
          const fy = faceYaw(o.face, s.x, s.z);
          const k = ease('smooth', clamp((dt - pr.T) / (o.turnDur ?? 0.6)));
          s.yaw = s.yaw + wrapAngle(fy - s.yaw) * k;
        }
        if (pr.done) { s.speed = 0; s.moving = clamp(1 - (dt - pr.T) / 0.25); }
        s.gait = name;
        break;
      }
      case 'turn': {
        const target = typeof o.to === 'number' ? yawFromHeading(o.to) : (o.by != null ? s.yaw + o.by * D2R : faceYaw(o.to, s.x, s.z));
        const k = ease('smooth', clamp(dt / (o.dur ?? 0.7)));
        s.yaw = s.yaw + wrapAngle(target - s.yaw) * k;
        break;
      }
      case 'crouch': case 'kneel': case 'sit': case 'bow': case 'lean': {
        const to = o.to ?? 1, from = s.posture[name];
        s.posture[name] = from + (to - from) * ease('smooth', clamp(dt / (o.dur ?? 0.8)));
        break;
      }
      case 'rise': {
        const k = ease('smooth', clamp(dt / (o.dur ?? 0.9)));
        for (const n of POSTURES) s.posture[n] *= 1 - k;
        break;
      }
      case 'hide': case 'show': break;
      default:
        // creature poses and custom actions are recorded as the current base action
        s.action = { name, o, t0, dt };
    }
    if (name !== 'walk' && name !== 'run' && name !== 'hurry' && !OVERLAYS.has(name) && name !== 'look') {
      // standing still after a walk: the gait settles
      if (s.speed === 0 && s.moving > 0) s.moving = 0;
    }
  }
  // the last base action (creatures: the pose to use), with the previous one for blending
  s.baseActs = acts.filter((a) => !OVERLAYS.has(a[1]) && a[1] !== 'look' && a[0] <= t);
  // key-framed root (creatures climbing out of an egg, props): root [[t, [x, y, z]], ...], yaw/pitch/roll keys (deg)
  if (spec.root) { const r = keyed(t, spec.root); s.x = r[0]; s.z = r[2]; s.yRoot = r[1]; }
  if (spec.yawKeys) s.yaw = yawFromHeading(keyed(t, spec.yawKeys));
  s.pitch = spec.pitch == null ? 0 : (typeof spec.pitch === 'number' ? spec.pitch : keyed(t, spec.pitch)) * D2R;
  s.roll = spec.roll == null ? 0 : (typeof spec.roll === 'number' ? spec.roll : keyed(t, spec.roll)) * D2R;
  s.y = s.yRoot ?? (env.ground ? env.ground(s.x, s.z) : 0);
  if (spec.y != null) s.y = typeof spec.y === 'number' ? spec.y : keyed(t, spec.y);
  if (spec.dy != null) s.y += typeof spec.dy === 'number' ? spec.dy : keyed(t, spec.dy);
  return s;
}

/** Is an actor visible at shot time t? (`hide` / `show` acts, `visible` key list) */
export function actorVisible(spec, t) {
  if (spec.visible === false) return false;
  let v = true;
  for (const [t0, name] of spec.acts || []) { if (t0 > t) break; if (name === 'hide') v = false; if (name === 'show') v = true; }
  return v;
}
