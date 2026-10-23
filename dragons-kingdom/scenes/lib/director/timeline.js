// Shot director - timelines, keyframes and easing (pure JS: runs in the browser AND in Node).
//
// A SET SCENE renders many shots from one browser setup. Inside the set scene every shot owns
// its own stretch of the scene's time axis ("set time"):
//
//     |--pre--|======== shot frames ========|--post--|  gap  |--pre--|==== next shot ====| ...
//             ^ start_s (a whole second)
//
// * start_s is a whole second, so `render.mjs --start <start_s> --seconds <frames/24>` gives
//   exactly the planned frames (render-jobs.json / episode.mjs contract);
// * `pre` / `post` are handle frames (dissolves, slips in the edit) that are rendered by the same
//   shot setup when the editor asks for them; the master job renders only the shot frames;
// * between two shots' handles there is at least `gapS` seconds of nothing, so the velocity
//   motion-blur shutter (t - T/2) and accumulated sub-frames never reach another shot.
//
// update(t, ctx) picks the shot from ctx.frame (the frame being made, which stays fixed while the
// cinematic stack evaluates sub-frame times) and the shot-local time from t. Everything here is a
// pure function of its arguments.

export const FPS = 24;

/**
 * Lay out a set's shots on the set time axis.
 * shots: [{ job, frames, pre = 0, post = 0, ...anything }] in the order they should sit.
 * opts: { fps = 24, gapS = 1, firstStart = 0 }
 * Returns new objects with start_s, start_frame, frames, pre, post, range [f0, f1) (incl. handles).
 */
export function layoutSet(shots, opts = {}) {
  const fps = opts.fps ?? FPS, gap = opts.gapS ?? 1;
  let t = opts.firstStart ?? 0;
  const out = [];
  for (const s of shots) {
    const pre = s.pre | 0, post = s.post | 0;
    // earliest start: the previous shot's handles + the gap, then this shot's own pre handle
    let start = Math.ceil(t + pre / fps - 1e-9);
    if (start < 0) start = 0;
    const f0 = start * fps - pre, f1 = start * fps + s.frames + post;
    if (f0 < 0) throw new Error(`layoutSet: shot ${s.job} pre-handle (${pre} frames) would start before frame 0`);
    out.push({ ...s, start_s: start, start_frame: start * fps, frames: s.frames, pre, post, range: [f0, f1] });
    t = f1 / fps + gap;
  }
  return out;
}

/**
 * The shot that owns `frame`, and the shot-local time for `t` (seconds from the shot's first frame;
 * negative inside the pre handle). Frames in a gap belong to the nearest shot (they are never
 * rendered by the plan, but a still at any time must still show something sane).
 * table: the shots array of a <set>.shots.json (with start_frame/frames/pre/post).
 */
export function shotAt(table, frame, t, fps = FPS) {
  let best = null, bd = Infinity;
  for (const s of table) {
    const f0 = s.start_frame - (s.pre | 0), f1 = s.start_frame + s.frames + (s.post | 0);
    if (frame >= f0 && frame < f1) { best = s; bd = 0; break; }
    const d = frame < f0 ? f0 - frame : frame - f1 + 1;
    if (d < bd) { bd = d; best = s; }
  }
  if (!best) return null;
  const local = t - best.start_frame / fps;
  return { shot: best, local, frameInShot: frame - best.start_frame, u: Math.min(1, Math.max(0, local / (best.frames / fps))) };
}

// ------------------------------------------------------------------ easing --
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const EASES = {
  linear: (x) => x,
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
  smooth: (x) => x * x * (3 - 2 * x),
  smoother: (x) => x * x * x * (x * (x * 6 - 15) + 10),
  // a camera operator's move: accelerates gently, settles gently (sine)
  sine: (x) => 0.5 - 0.5 * Math.cos(Math.PI * x),
  hold: () => 0,
};
/** ease(name|fn, x) for x in 0..1 */
export function ease(e, x) {
  const f = typeof e === 'function' ? e : EASES[e || 'smooth'];
  if (!f) throw new Error(`unknown ease "${e}" (${Object.keys(EASES).join(', ')})`);
  return f(clamp(x));
}

const mixv = (a, b, w) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], w)) : lerp(a, b, w));

/**
 * Keyframed value at time t. keys: [[t0, v0], [t1, v1, ease?], ...] sorted by time; values are
 * numbers or arrays of numbers. Before the first key -> v0, after the last -> vN. The ease of a
 * key applies to the segment that ENDS at it (default opts.ease, 'smooth').
 * A plain value (not a key list) is returned as it is.
 */
export function keyed(t, keys, opts = {}) {
  if (!isKeyList(keys)) return keys;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      if (typeof v0 !== 'number' && !Array.isArray(v0)) return t1 - t <= 1e-9 ? v1 : v0;   // non-numeric: step
      const w = t1 > t0 ? ease(e1 || opts.ease || 'smooth', (t - t0) / (t1 - t0)) : 1;
      return mixv(v0, v1, w);
    }
  }
  return keys[keys.length - 1][1];
}
/** [[number, value], ...] ? */
export function isKeyList(v) {
  return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && v[0].length >= 2 && typeof v[0][0] === 'number';
}

/** Smooth 1D value noise in [-1, 1], seeded, pure (for small drifts: breathing props, flicker). */
export function vnoise1(t, seed = 1) {
  const i = Math.floor(t), f = t - i;
  const h = (n) => { let x = Math.imul((n + seed * 7919) | 0, 0x9e3779b1) ^ 0x85ebca6b; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; return ((x >>> 0) / 4294967296) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

/** Integer hash -> [0, 1) (stateless, for per-index variation inside update). */
export function hash01(...v) {
  let h = 2166136261 >>> 0;
  for (const x of v) { h ^= (x * 2654435761) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Seconds -> 'HH:MM:SS:FF' at fps. */
export function timecode(seconds, fps = FPS) {
  const f = Math.round(seconds * fps);
  const ff = f % fps, s = Math.floor(f / fps);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(ff)}`;
}
