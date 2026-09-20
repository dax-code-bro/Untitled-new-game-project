/* Build a gait from the FOOT'S PATH, not from joint angles.  (See the
   long note that goes into 90-animation.js -- this is the tool.)  */
const THIGH = 0.42, SHIN = 0.40, LEG = THIGH + SHIN;
const HIPOFF = 0.04, FLOOR = -0.875, ANKLE = 0.017, GROUND = FLOOR + ANKLE;
const DEG = 180 / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
function curve(pts, p) {
  p = ((p % 1) + 1) % 1;
  for (let i = 0; i + 1 < pts.length; i++)
    if (p >= pts[i][0] && p <= pts[i + 1][0])
      return lerp(pts[i][1], pts[i + 1][1], (p - pts[i][0]) / Math.max(1e-9, pts[i + 1][0] - pts[i][0]));
  return pts[pts.length - 1][1];
}
function solveLeg(dy, dz) {
  const d0 = Math.hypot(dy, dz), d = Math.min(d0, LEG * 0.999);
  const PHI = Math.atan2(-dz, -dy);
  const a = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d))));
  const b = Math.acos(Math.max(-1, Math.min(1, (SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d))));
  return { hip: (PHI - a) * DEG, knee: (a + b) * DEG, reach: d0 / LEG };
}
/* The ankle's path, in actor space, over one cycle with contact at p=0.

   The ankle's HEIGHT is derived from the ankle's PITCH rather than
   authored beside it. Authoring the two separately is what put the toes
   through the floor: a sole pitched 14 degrees toe-down with its ankle
   still at standing height buries the toe 28 mm, and the first pass did
   exactly that on the run, the sprint and the crouch run. Solve instead
   for the height at which whichever end of the sole is lower -- toe at
   +0.120, heel at -0.062, both ANKLE below the joint -- rests exactly on
   the floor, and the foot cannot penetrate at all. The rise onto the toe
   at push-off then falls out of the pitch curve instead of being a
   second number that has to agree with it. */
const TOE = 0.120, HEEL = 0.062;
function soleHeight(aDeg) {
  const a = aDeg / DEG, s = Math.sin(a);
  return ANKLE * Math.cos(a) + Math.max(TOE * s, -HEEL * s);
}
function stanceAnkle(g, p) { return curve(g.ankle, p / g.stance); }
function anklePath(g, p) {
  const S = g.stance;
  const a = g.absCurve ? curve(g.absCurve, p) : stanceAnkle(g, Math.min(p, S * 0.999));
  if (p < S) {
    /* Planted. The ground carries the contact point back at a constant
       rate; as the foot rolls up onto the toe the ankle swings forward
       over it, which is the `slip` term. */
    const slip = a > 0 ? TOE * (1 - Math.cos(a / DEG)) : 0;
    return [FLOOR + soleHeight(a), (g.zoff || 0) + g.zf - g.stride * p + slip];
  }
  /* Swing. The foot is in the air, so nothing is resting on anything and
     the sole's angle no longer sets the height -- it just carries on up
     from wherever push-off left it and arcs over.

     BOTH CHANNELS HAVE TO MEET THE STANCE THEY SIT BETWEEN, in value AND
     in speed. The first version met them in value only, and the sprint's
     foot recorded 2977 m/s^2 -- three hundred gravities -- from two
     joins: a forward sweep that eased to a standstill at 86% and then
     snapped backwards at 1.3 m/s to settle onto the contact point, and a
     lift shaped sin(pi * s^0.62), whose slope at s=0 is infinite.

     So the horizontal is one cubic from toe-off to touchdown with the
     ground's own backward rate at BOTH ends, which is what a foot
     actually does: it is still travelling back as it leaves, and it is
     travelling back again as it lands, which is why a good sprinter's
     foot does not skid on contact. And the lift is s^a (1-s)^b with both
     exponents above one, so it leaves and arrives at a finite speed
     while still peaking wherever the gait wants it. */
  const s = (p - S) / (1 - S);
  const off = g.absCurve ? curve(g.absCurve, S) : stanceAnkle(g, S * 0.999);
  const zBack = (g.zoff || 0) + g.zf - g.stride * S + (off > 0 ? TOE * (1 - Math.cos(off / DEG)) : 0);
  const zEnd = (g.zoff || 0) + g.zf;
  const m = -g.stride * (1 - S);                 // ds of the ground, per unit swing
  const s2 = s * s, s3 = s2 * s;
  const z = (2 * s3 - 3 * s2 + 1) * zBack + (-2 * s3 + 3 * s2) * zEnd
    + (s3 - 2 * s2 + s) * m + (s3 - s2) * m;
  const P = g.arcPeak || 0.45, K = 4;
  const a2 = K * P, b2 = K * (1 - P);
  const peak = Math.pow(P, a2) * Math.pow(1 - P, b2);
  const y = FLOOR + Math.max(soleHeight(a), ANKLE)
    + g.clear * (Math.pow(s, a2) * Math.pow(1 - s, b2)) / peak;
  return [y, z];
}

/* SOLVE the pelvis height from the STANCE KNEE, instead of authoring it.

   Hand-written pelvis heights were the other half of the floor problem:
   set the pelvis where it looks right and the leg often cannot reach the
   floor from there -- the run wanted 110% of its own leg length at
   push-off -- so the IK clamps, the foot leaves its path, and the result
   slides and floats.

   But the pelvis height is not a free choice. Given where the planted
   ankle is and how much the knee over it is bent, the hip can only be in
   one place. So author the thing an animator actually has an opinion
   about -- how much the stance knee flexes as the body rolls over it,
   which is the shock absorber and is 15 to 20 degrees in a walk and 40
   in a run -- and let the pelvis follow from it.

   What comes back is the real curve: lowest just after contact where the
   knee takes the landing, highest over the straightening leg at
   push-off, twice a cycle. In the air, where no leg constrains anything,
   the body is simply falling, so the gap is bridged with the parabola
   gravity would draw. */
function kneeDistance(theta) {
  const c = Math.cos(theta / DEG);
  return Math.sqrt(THIGH * THIGH + SHIN * SHIN + 2 * THIGH * SHIN * c);
}
function solvePelvis(g) {
  const N = 96, raw = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const p = i / N;
    let cap = null;
    for (const ph of [0, 0.5]) {
      const q = ((p + ph) % 1 + 1) % 1;
      if (q >= g.stance) continue;                     // that leg is swinging
      const [fy, fz] = anklePath(g, q);
      /* Half a per cent short of what the knee profile asks. The cap
         works in the plane of the leg and ignores the three millimetres
         the pelvis lean moves the hip joint; without the margin the walk
         came out asking for 100.6% of its own leg and the IK clamped. */
      const d = Math.min(kneeDistance(curve(g.kneeStance, q / g.stance)), LEG * 0.999) * 0.995;
      const h = d * d - fz * fz;
      if (h <= 0) continue;
      const v = fy + Math.sqrt(h) + HIPOFF;
      cap = cap == null ? v : Math.min(cap, v);
    }
    raw[i] = cap;
  }
  /* Flight: both feet off the floor. Bridge each gap with the arc
     gravity draws -- apex g*t^2/8 above the chord, which for a run's
     84 ms of air is nine millimetres. */
  for (let i = 0; i < N; i++) {
    if (raw[i] != null) continue;
    let a = i; while (raw[((a - 1) % N + N) % N] == null && a > i - N) a--;
    let b = i; while (raw[(b + 1) % N] == null && b < i + N) b++;
    const i0 = ((a - 1) % N + N) % N, i1 = (b + 1) % N;
    const n = b - a + 2, tf = (n / N) * g.T;
    const rise = 9.81 * tf * tf / 8;
    const s = (i - a + 1) / n;
    raw[i] = raw[i0] + (raw[i1] - raw[i0]) * s + rise * Math.sin(Math.PI * s);
  }
  /* The cap is a minimum of two curves and has a crease wherever the
     constraint changes legs. Box-smoothing it left a secondary bump in
     each half cycle -- FOUR pelvis peaks per cycle where a body has two
     -- so instead keep only the first three harmonics. A pelvis
     rising and falling twice a cycle IS a second harmonic; the fourth
     puts FOUR peaks in a cycle, which is exactly what the run came out
     with, so the fourth is the crease and not the gait.

     Then slide the whole thing down under the cap again, because a
     smooth curve that pokes through by three millimetres asks the leg
     for more than its own length and the IK clamps. */
  const H = 3, re = new Array(H + 1).fill(0), im = new Array(H + 1).fill(0);
  for (let h = 0; h <= H; h++)
    for (let i = 0; i < N; i++) {
      const th = 2 * Math.PI * h * i / N;
      re[h] += raw[i] * Math.cos(th); im[h] += raw[i] * Math.sin(th);
    }
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    let v = re[0] / N;
    for (let h = 1; h <= H; h++) {
      const th = 2 * Math.PI * h * i / N;
      v += 2 * (re[h] * Math.cos(th) + im[h] * Math.sin(th)) / N;
    }
    out[i] = v;
  }
  return out.map((v, i) => [i / N, v]).concat([[1, out[0]]]);
}

/* Emit the three tracks for one leg, offset by `phase` of a cycle.

   The ankle is authored TWO different ways, because it means two
   different things. On the floor the number that matters is the sole's
   angle to the WORLD -- the thing that decides whether the foot lies
   flat or the heel is up. In the air nothing rests on anything, and the
   number that matters is the ankle's own JOINT angle, relative to the
   shin above it.

   Writing the whole cycle as world angles is what produced 85 degrees of
   dorsiflexion in the sprint: with the knee folded to 120 in swing the
   shin points up and back, and holding the sole level from there needs
   an ankle bent three times as far as an ankle bends. So swing is
   authored locally, and anchored at both ends to whatever the stance
   solve leaves, so there is no step at the hand-off. */
const ANKLE_MIN = -25, ANKLE_MAX = 50;   // dorsiflexion, plantarflexion

/* The ankle's JOINT angle at any phase, which is the one thing both the
   settling pass and the posing pass have to agree about. They did not:
   the pose anchored the swing curve to whatever the stance solve left,
   and the settle used the raw swing curve, so the sole's world angle
   jumped 45 degrees across toe-off and the sprint's foot recorded 3510
   deg/s crossing it. One function now, called by both. */
function ankleJoint(g, p, deg, hip, knee, a0, a1) {
  if (p < g.stance) return stanceAnkle(g, p) - deg - hip - knee;
  const s = (p - g.stance) / (1 - g.stance);
  let fx = curve(g.swing, s);
  if (s < 0.22) fx = lerp(a0, fx, s / 0.22);
  else if (s > 0.84) fx = lerp(fx, a1, (s - 0.84) / 0.16);
  return fx;
}
function leg(g, phase, keys) {
  const hip = [], knee = [], foot = [];
  let reach = 0, lowToe = 1e9, lowHeel = 1e9, clamped = 0;
  const a0 = localAt(g, g.stance - 1e-4), a1 = localAt(g, 0);
  for (const p0 of keys) {
    const p = ((p0 + phase) % 1 + 1) % 1;
    const k = solveAt(g, p);
    let fx = ankleJoint(g, p, k.deg, k.hip, k.knee, a0, a1);
    if (fx < ANKLE_MIN) { clamped = Math.max(clamped, ANKLE_MIN - fx); fx = ANKLE_MIN; }
    if (fx > ANKLE_MAX) { clamped = Math.max(clamped, fx - ANKLE_MAX); fx = ANKLE_MAX; }
    const absFoot = k.deg + k.hip + k.knee + fx;
    hip.push([p0, +k.hip.toFixed(1)]);
    knee.push([p0, +k.knee.toFixed(1)]);
    foot.push([p0, +fx.toFixed(1)]);
    reach = Math.max(reach, k.reach);
    const a = absFoot / DEG, ca = Math.cos(a), sa = Math.sin(a);
    lowToe = Math.min(lowToe, k.fy - ANKLE * ca - TOE * sa);
    lowHeel = Math.min(lowHeel, k.fy - ANKLE * ca + HEEL * sa);
  }
  return { hip, knee, foot, reach, lowToe, lowHeel, clamped };
}

function fmt(track, y, z) {
  return '[' + track.map(([p, v]) => `[${p.toFixed(2)}, ${v}, ${y || 0}, ${z || 0}]`).join(', ') + ']';
}
/* An ankle bends 25 degrees back and 50 forward, and no further. In a
   crouch deep enough to put the eyes at 1.20 m -- which is what this
   game's crouch capsule is -- the knee is at a hundred degrees and the
   sole simply CANNOT lie flat: the heel is up and the man is on the
   balls of his feet. Authoring the sole's world angle as if it could
   asked for 44 degrees of dorsiflexion, got 25, and drove the toe 57 mm
   through the floor, because the height the ankle was placed at had been
   computed from the angle it did not get.

   So the two are solved together. Place the ankle from the sole angle,
   solve the leg, see what ankle angle the joint can actually deliver,
   put the height back from THAT, and go round again. Four passes is
   enough to settle; the crouches come out on their toes, which is what a
   person in a deep crouch is on. */
/* Solve the leg at one phase, and the ankle's joint angle there. */
function solveAt(g, p) {
  const [fy, fz] = anklePath(g, p);
  const hy = curve(g.hipsY, p) - HIPOFF, pitch = curve(g.hipsPitch, p) / DEG;
  const dy0 = fy - hy, dz0 = fz, c = Math.cos(pitch), sn = Math.sin(pitch);
  const k = solveLeg(dy0 * c + dz0 * sn, -dy0 * sn + dz0 * c);
  k.deg = curve(g.hipsPitch, p); k.fy = fy; k.fz = fz;
  return k;
}
function localAt(g, p) {
  const k = solveAt(g, p);
  return stanceAnkle(g, Math.min(p, g.stance * 0.999)) - k.deg - k.hip - k.knee;
}

/* The smooth pelvis curve has the right SHAPE but not the right height:
   the cap it was fitted to is a minimum of two curves, so smoothing lifts
   it above the cap wherever the cap dips. Dropping the whole curve by
   that overshoot was the first attempt and it cost 17 mm of standing
   height in the walk and 58 in the crouch -- the deepest crease in the
   cap set the height of the entire gait.

   So set the height from the thing that actually matters. Slide the
   curve up until the furthest any leg has to reach is 99% of its own
   length, and no further. Twenty-four bisections settles it to a tenth
   of a millimetre. */
function liftPelvis(g, base, target = 0.99) {
  const N = 96;
  const reachAt = (lift) => {
    g.hipsY = base.map(([p, v]) => [p, v + lift]);
    let m = 0;
    for (let i = 0; i < N; i++)
      for (const ph of [0, 0.5]) m = Math.max(m, solveAt(g, ((i / N + ph) % 1)).reach);
    return m;
  };
  /* Only ever DOWN. The smooth curve already sits where the stance knee
     put it; the bisection is there to take back whatever the smoothing
     added, not to find a new height. Letting it search upwards stood the
     crouch walk up -- its legs are nowhere near their reach limit at a
     117 degree knee, so "lift until reach is 99%" raised the eyeline
     from 1.21 m to 1.42 and there was no crouch left. */
  let lo = -0.20, hi = 0;
  if (reachAt(lo) > target) { g.hipsY = base.map(([p, v]) => [p, v + lo]); return g.hipsY; }
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (reachAt(mid) <= target) lo = mid; else hi = mid;
  }
  g.hipsY = base.map(([p, v]) => [p, v + lo]);
  return g.hipsY;
}

function settleAnkle(g) {
  const N = 96;
  g.absCurve = Array.from({ length: N + 1 }, (_, i) => [i / N, curve(g.ankle, i / N)]);
  for (let pass = 0; pass < 4; pass++) {
    g.hipsY = liftPelvis(g, solvePelvis(g));
    const a0 = localAt(g, g.stance - 1e-4), a1 = localAt(g, 0);
    const next = g.absCurve.map(([p]) => {
      const k = solveAt(g, p);
      const got = Math.max(ANKLE_MIN, Math.min(ANKLE_MAX,
        ankleJoint(g, p, k.deg, k.hip, k.knee, a0, a1)));
      return [p, k.deg + k.hip + k.knee + got];
    });
    g.absCurve = next;
  }
  g.hipsY = liftPelvis(g, solvePelvis(g));
  return g;
}

module.exports = { leg, curve, fmt, settleAnkle, solvePelvis, GROUND, FLOOR, LEG, anklePath, DEG };
