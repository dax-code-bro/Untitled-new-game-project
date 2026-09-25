/* ============================================================
   MOTION — the curves every animation in the game shares.

   The animation code grew one feature at a time, and each feature
   reached for whatever curve was nearest: a linear ramp, a
   smoothstep, a sin half-cycle, an exponential chase. Every one of
   those is symmetric and every one arrives dead: no anticipation
   before a move, no follow-through after it, the same speed into a
   stop as out of it. That is what reads as "animated by a program"
   more than any pose does -- a bolt that comes back as slowly as it
   goes forward, a magazine that slides into the well on a ruler, a
   gun that stops on a pixel after a draw.

   This is the small vocabulary that replaces them, in one place so
   that every animation speaks it the same way:

     Ease        the named curves, including anticipation (inBack) and
                 overshoot (outBack) that nothing had before.
     mWin(u,a,b)  the 0..1 progress of u through [a, b], clamped -- the
                 unit every staged animation is written in.
     mSettle(t)  an analytic underdamped step: 0 -> 1 with a small
                 overshoot and a quick decay, as a function of TIME, so
                 it is frame-rate independent by construction. What a
                 gun does arriving at the shoulder.
     mKick(t)    an analytic impulse response: 0 -> peak -> slightly
                 past 0 -> rest. A landing dip, a recoil, a seat bump.
     mStroke(p)  a mechanism stroke over phase p: fast back, a short
                 dwell, a slower return, a bounce at the stop. What a
                 bolt, slide or pump actually does.
     mArc(...)   a point on a quadratic path lifted off the straight
                 line between two others -- hands move in arcs.
     Spring      a damped spring integrated exactly (the closed form of
                 the ODE over each step), stable at any dt, for motion
                 that has to chase a moving target: sway against the
                 look, a carry that follows the stance.
     noise1(t)   smooth 1-D value noise, for breathing and idle drift
                 that does not repeat every two seconds.

   Everything here is pure and allocation-free except Spring, which
   holds its own state.
   ============================================================ */

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

const Ease = {
  linear: (t) => clamp01(t),
  inQuad: (t) => { t = clamp01(t); return t * t; },
  outQuad: (t) => { t = clamp01(t); return t * (2 - t); },
  inOutQuad: (t) => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); },
  inCubic: (t) => { t = clamp01(t); return t * t * t; },
  outCubic: (t) => { t = 1 - clamp01(t); return 1 - t * t * t; },
  inOutCubic: (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t); },
  outQuint: (t) => { t = 1 - clamp01(t); return 1 - t * t * t * t * t; },
  /* C1 smoothstep and C2 smootherstep, kept here so the staged code
     reads one vocabulary. */
  smooth: (t) => { t = clamp01(t); return t * t * (3 - 2 * t); },
  smoother: (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); },
  /* ANTICIPATION: dips below 0 before it goes -- the wind-up of a
     swing, the tug down before a magazine is pulled. s ~ 1.2 is a
     visible dip, 0.6 a hint of one. */
  inBack: (t, s = 1.2) => { t = clamp01(t); return t * t * ((s + 1) * t - s); },
  /* OVERSHOOT: goes past 1 and comes back -- the gun that arrives and
     settles, the hinge that snaps shut. */
  outBack: (t, s = 1.2) => { t = clamp01(t) - 1; return 1 + t * t * ((s + 1) * t + s); },
  inOutBack: (t, s = 1.0) => {
    t = clamp01(t); const k = s * 1.525;
    return t < 0.5 ? (2 * t) * (2 * t) * ((k + 1) * 2 * t - k) / 2
                   : ((2 * t - 2) * (2 * t - 2) * ((k + 1) * (2 * t - 2) + k) + 2) / 2;
  },
};

/* Progress of u through [a, b], clamped. */
function mWin(u, a, b) { return b <= a ? (u >= b ? 1 : 0) : clamp01((u - a) / (b - a)); }

/* An underdamped unit step as a function of time t (seconds).
   freq is the natural frequency in Hz, zeta the damping ratio (<1
   overshoots). At the defaults it passes 1 at about 0.11 s, peaks
   ~6% over and is within 1% by 0.35 s. */
function mSettle(t, freq = 3.2, zeta = 0.62) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  if (zeta >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}

/* An impulse response normalised to a peak of 1: rises fast, falls,
   swings a little past zero and dies. t in seconds. */
function mKick(t, freq = 2.6, zeta = 0.5) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq, wd = w * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
  const tp = Math.atan2(wd, zeta * w) / wd;                 // time of the first peak
  const peak = Math.exp(-zeta * w * tp) * Math.sin(wd * tp);
  return Math.exp(-zeta * w * t) * Math.sin(wd * t) / peak;
}

/* A mechanism stroke over phase p in [0, 1] -> travel in [0, 1]:
   driven back hard (ease-out, the first `back` of the phase), held
   for `dwell`, returned under the spring (ease-in-out) and bounced
   once off the stop. The bounce is a few per cent of travel, which is
   what a bolt slamming home looks like at 60 fps. */
function mStroke(p, back = 0.30, dwell = 0.10, bounce = 0.06) {
  if (p <= 0 || p >= 1) return 0;
  if (p < back) return Ease.outCubic(p / back);
  if (p < back + dwell) return 1;
  const r = (p - back - dwell) / (1 - back - dwell);
  if (r < 0.82) return 1 - Ease.inCubic(r / 0.82);
  // Off the stop: a small rebound, gone by the end of the phase.
  const b = (r - 0.82) / 0.18;
  return bounce * Math.sin(Math.PI * b) * (1 - b);
}

/* The lift a weapon makes over a reload u in [0, 1]: up to where the
   hands work briskly (the first `rise`), a slow working drift while they
   are busy, back down from `fall`, and a small settle dip at the carry
   before it comes to rest -- instead of a half-sine that took as long to
   come up as to go down and arrived at the carry dead. 0 at both ends. */
function mLift(u, rise = 0.18, fall = 0.80) {
  if (u <= 0 || u >= 1) return 0;
  if (u < rise) return Ease.outCubic(u / rise);
  if (u < fall) return 1 - 0.05 * Math.sin(Math.PI * (u - rise) / (fall - rise));
  const r = (u - fall) / (1 - fall);
  if (r < 0.8) return 1 - Ease.inOutCubic(r / 0.8);
  const b = (r - 0.8) / 0.2;
  return -0.05 * Math.sin(Math.PI * b);
}

/* A point on the quadratic curve from a to b whose midpoint is lifted
   by `lift` (a vector, the same length as a and b). t is the eased
   progress. Writes into out (an array) and returns it. */
function mArc(out, a, b, lift, t) {
  const u = 1 - t, k = 2 * u * t;
  for (let i = 0; i < a.length; i++) out[i] = u * u * a[i] + t * t * b[i] + k * ((a[i] + b[i]) * 0.5 + lift[i]);
  return out;
}

/* A damped spring on one value, integrated exactly over each step so
   it neither explodes at a long frame nor changes character with the
   frame rate. freq in Hz, zeta the damping ratio. */
class Spring {
  constructor(freq = 4, zeta = 0.7, value = 0) {
    this.freq = freq; this.zeta = zeta; this.value = value; this.velocity = 0;
  }
  reset(v = 0) { this.value = v; this.velocity = 0; return this; }
  update(target, dt) {
    if (!(dt > 0)) return this.value;
    const w = 2 * Math.PI * this.freq, z = this.zeta;
    const x0 = this.value - target, v0 = this.velocity;
    let x, v;
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * dt);
      const c = Math.cos(wd * dt), s = Math.sin(wd * dt);
      const B = (v0 + z * w * x0) / wd;
      x = e * (x0 * c + B * s);
      // The derivative of that with respect to time.
      v = -z * w * x + e * (-x0 * wd * s + B * wd * c);
    } else {
      const e = Math.exp(-w * dt);
      x = (x0 + (v0 + w * x0) * dt) * e;
      v = (v0 - (v0 + w * x0) * w * dt) * e;
    }
    this.value = target + x;
    this.velocity = v;
    return this.value;
  }
}

/* Smooth 1-D value noise in [-1, 1], continuous in t, repeating only
   every 256 units. For breathing and idle drift. */
const _N1 = (() => { const r = new Float32Array(256); let s = 1234567; for (let i = 0; i < 256; i++) { s = (s * 16807) % 2147483647; r[i] = (s / 2147483647) * 2 - 1; } return r; })();
function noise1(t, seed = 0) {
  const x = t + seed * 37.1, i = Math.floor(x), f = x - i;
  const a = _N1[i & 255], b = _N1[(i + 1) & 255];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

const Motion = { Ease, win: mWin, settle: mSettle, kick: mKick, stroke: mStroke, lift: mLift, arc: mArc, Spring, noise1, clamp01 };
