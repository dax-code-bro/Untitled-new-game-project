/* Build a gait from the FOOT'S PATH, not from joint angles.
 *
 * Every locomotion clip in this engine was once authored by writing hip
 * and knee degrees straight into a table, and the result was a walk and
 * a run in which NEITHER FOOT EVER REACHED IN FRONT OF THE PELVIS
 * (measured: walk footZ -0.59..-0.02, run -0.77..-0.12). Two comments in
 * the source asserted that a positive upper leg is forward. It is not --
 * upperLegL.x = +20 puts the foot at z -0.280 -- so the whole cycle was
 * written mirrored.
 *
 * Writing angles again would just be a better guess. So instead: say
 * where the FOOT goes -- planted on the floor through stance, arcing
 * clear through swing -- and solve the hip and knee that put it there. A
 * gait built this way cannot slide, cannot sink through the floor and
 * cannot have its phases mirrored, because those are properties of the
 * path and the path is the input.
 *
 * THE TWO LEGS MAY DIFFER. A gait carries `L` and `R` leg specs over a
 * shared pelvis and a shared stride -- because the dead do not walk
 * symmetrically. One leg drives and the other drags, and a drag is a
 * short stance, a low swing and a toe that never leaves the floor.
 *
 * Sign conventions, all four MEASURED off the rig, not read:
 *   upperLeg.x  negative swings the leg FORWARD  (+20 -> foot z -0.280)
 *   lowerLeg.x  positive flexes the knee
 *   foot.x      positive points the toe DOWN     (+20 -> toe y -0.901)
 *   upperArm.x  negative raises the arm FORWARD  (-90 -> hand z +0.510)
 *   lowerArm.x  negative flexes the elbow        (-90 -> hand z +0.252)
 */
const THIGH = 0.42, SHIN = 0.40, LEG = THIGH + SHIN;
const HIPOFF = 0.04, FLOOR = -0.875, ANKLE = 0.017, TOE = 0.120, HEEL = 0.062;
const DEG = 180 / Math.PI;
const ANKLE_MIN = -25, ANKLE_MAX = 50;   // dorsiflexion, plantarflexion

const lerp = (a, b, t) => a + (b - a) * t;
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
function kneeDistance(theta) {
  return Math.sqrt(THIGH * THIGH + SHIN * SHIN + 2 * THIGH * SHIN * Math.cos(theta / DEG));
}
/* The ankle's HEIGHT is derived from the ankle's PITCH rather than
   authored beside it. Authoring the two separately is what put the toes
   through the floor: a sole pitched 14 degrees toe-down with its ankle
   still at standing height buries the toe 28 mm. Solve instead for the
   height at which whichever end of the sole is lower -- toe at +0.120,
   heel at -0.062, both ANKLE below the joint -- rests exactly on the
   floor, and the foot cannot penetrate at all. */
function soleHeight(aDeg) {
  const a = aDeg / DEG, s = Math.sin(a);
  return ANKLE * Math.cos(a) + Math.max(TOE * s, -HEEL * s);
}

/* ---- one leg, at one phase of the cycle ---- */
function stanceAnkle(L, p) { return curve(L.ankle, p / L.stance); }
function anklePath(g, L, p) {
  const S = L.stance, stride = g.stride, off0 = L.zoff || 0;
  const a = L.absCurve ? curve(L.absCurve, p) : stanceAnkle(L, Math.min(p, S * 0.999));
  if (p < S) {
    /* Planted. The ground carries the contact point back at a constant
       rate; as the foot rolls up onto the toe the ankle swings forward
       over it, which is the `slip` term. */
    const slip = a > 0 ? TOE * (1 - Math.cos(a / DEG)) : 0;
    return [FLOOR + soleHeight(a), off0 + L.zf - stride * p + slip];
  }
  /* Swing. BOTH CHANNELS MEET THE STANCE THEY SIT BETWEEN, in value and
     in speed. Meeting them in value only gave the sprint's foot 2977
     m/s^2 -- three hundred gravities -- from a sweep that eased to a
     standstill and then snapped backwards onto the contact point, and a
     lift shaped sin(pi*s^0.62) whose slope at s=0 is infinite. So the
     horizontal is one cubic carrying the ground's own backward rate at
     both ends, which is what a foot does and why a good sprinter's foot
     does not skid on contact; and the lift is s^a (1-s)^b with both
     exponents above one. */
  const s = (p - S) / (1 - S);
  const off = L.absCurve ? curve(L.absCurve, S) : stanceAnkle(L, S * 0.999);
  const zBack = off0 + L.zf - stride * S + (off > 0 ? TOE * (1 - Math.cos(off / DEG)) : 0);
  const zEnd = off0 + L.zf;
  const m = -stride * (1 - S);
  const s2 = s * s, s3 = s2 * s;
  const z = (2 * s3 - 3 * s2 + 1) * zBack + (-2 * s3 + 3 * s2) * zEnd
    + (s3 - 2 * s2 + s) * m + (s3 - s2) * m;
  const P = L.arcPeak || 0.45, K = 4;
  const a2 = K * P, b2 = K * (1 - P);
  const peak = Math.pow(P, a2) * Math.pow(1 - P, b2);
  const y = FLOOR + Math.max(soleHeight(a), ANKLE)
    + L.clear * (Math.pow(s, a2) * Math.pow(1 - s, b2)) / peak;
  return [y, z];
}
/* The ankle's JOINT angle -- the one thing the settling pass and the
   posing pass have to agree about. They did not: the pose anchored the
   swing curve to whatever the stance solve left and the settle used the
   raw swing curve, so the sole's world angle jumped 45 degrees across
   toe-off. One function now, called by both. */
function ankleJoint(L, p, deg, hip, knee, a0, a1) {
  if (p < L.stance) return stanceAnkle(L, p) - deg - hip - knee;
  const s = (p - L.stance) / (1 - L.stance);
  let fx = curve(L.swing, s);
  if (s < 0.22) fx = lerp(a0, fx, s / 0.22);
  else if (s > 0.84) fx = lerp(fx, a1, (s - 0.84) / 0.16);
  return fx;
}
/* `q` is where this LEG is in its own cycle; `P` is where the CLIP is.
   They differ by the leg's phase, and for a gait whose two legs are
   mirror images they differ by exactly half a cycle -- which is also the
   period of the pelvis bob, so using one for the other cancelled and
   nothing showed. It does not cancel when the two legs are not mirror
   images. The limp solved its bad leg against the pelvis a quarter of a
   cycle away from where the clip actually puts it, and that foot came
   out 46 mm below the path and through the floor. */
function solveAt(g, L, q, P) {
  const p = q;
  if (P == null) P = q;
  const [fy, fz] = anklePath(g, L, p);
  const hy = curve(g.hipsY, P) - HIPOFF, pitch = curve(g.hipsPitch, P) / DEG;
  /* Into the hips' frame. R(t) sends (0,1,0) to (0,cos t, sin t), so the
     inverse is R(-t): cos/+sin, -sin/cos. Writing cos(-t)/sin(-t) into
     the FORWARD matrix instead applies R(+t) and counts the lean TWICE
     -- which put every foot 8 degrees further back than asked, a flat
     107 mm of stride lost. */
  const dy0 = fy - hy, dz0 = fz, c = Math.cos(pitch), sn = Math.sin(pitch);
  const k = solveLeg(dy0 * c + dz0 * sn, -dy0 * sn + dz0 * c);
  k.deg = curve(g.hipsPitch, P); k.fy = fy; k.fz = fz;
  return k;
}
function localAt(g, L, q) {
  const k = solveAt(g, L, q, ((q - L.phase) % 1 + 1) % 1);
  return stanceAnkle(L, Math.min(q, L.stance * 0.999)) - k.deg - k.hip - k.knee;
}

/* ---- the pelvis ----
   Hand-written pelvis heights were the other half of the floor problem:
   set the pelvis where it looks right and the leg often cannot reach the
   floor from there -- the run wanted 110% of its own leg length at
   push-off -- so the IK clamps, the foot leaves its path, and the result
   slides and floats.

   But the pelvis height is not a free choice. Given where a planted
   ankle is and how far the knee over it is bent, the hip can only be in
   one place. So author the thing an animator has an opinion about -- how
   much the stance knee flexes as the body rolls over it, which is the
   shock absorber -- and let the pelvis follow. In the air, where no leg
   constrains anything, the body is falling, so the gap is bridged with
   the parabola gravity draws. */
function solvePelvis(g) {
  const N = 96, raw = new Array(N).fill(null);
  for (let i = 0; i < N; i++) {
    const p = i / N;
    let cap = null;
    for (const side of ['L', 'R']) {
      const L = g[side], ph = L.phase;
      const q = ((p + ph) % 1 + 1) % 1;
      if (q >= L.stance) continue;
      const [fy, fz] = anklePath(g, L, q);
      /* Half a per cent short of what the knee profile asks: the cap
         works in the plane of the leg and ignores the three millimetres
         the pelvis lean moves the hip joint. */
      const d = Math.min(kneeDistance(curve(L.kneeStance, q / L.stance)), LEG * 0.999) * 0.995;
      const h = d * d - fz * fz;
      if (h <= 0) continue;
      const v = fy + Math.sqrt(h) + HIPOFF;
      cap = cap == null ? v : Math.min(cap, v);
    }
    raw[i] = cap;
  }
  for (let i = 0; i < N; i++) {
    if (raw[i] != null) continue;
    let a = i; while (raw[((a - 1) % N + N) % N] == null && a > i - N) a--;
    let b = i; while (raw[(b + 1) % N] == null && b < i + N) b++;
    const i0 = ((a - 1) % N + N) % N, i1 = (b + 1) % N;
    if (raw[i0] == null || raw[i1] == null) { raw[i] = 0; continue; }
    const n = b - a + 2, tf = (n / N) * g.T;
    const s = (i - a + 1) / n;
    raw[i] = raw[i0] + (raw[i1] - raw[i0]) * s + (9.81 * tf * tf / 8) * Math.sin(Math.PI * s);
  }
  /* The cap is a minimum of two curves and creases wherever the
     constraint changes legs. Box-smoothing left a secondary bump in each
     half cycle -- FOUR pelvis peaks where a body has two -- so keep only
     the first three harmonics. A pelvis rising twice a cycle IS a second
     harmonic; the fourth is the crease. */
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
/* The smooth curve has the right SHAPE but not the right height: it sits
   above the cap wherever the cap dips. Dropping it by that overshoot cost
   17 mm of standing height in the walk and 58 in the crouch -- the
   deepest crease was setting the height of the whole gait. Set the height
   from what matters instead: slide it DOWN until the furthest any leg
   reaches is 99% of its own length. Only down -- searching upward stood
   the crouch walk up from a 1.21 m eyeline to 1.42. */
function liftPelvis(g, base, target = 0.99) {
  const N = 96;
  const reachAt = (lift) => {
    g.hipsY = base.map(([p, v]) => [p, v + lift]);
    let m = 0;
    for (let i = 0; i < N; i++)
      for (const side of ['L', 'R'])
        m = Math.max(m, solveAt(g, g[side], (i / N + g[side].phase) % 1, i / N).reach);
    return m;
  };
  let lo = -0.30, hi = 0;
  if (reachAt(lo) > target) { g.hipsY = base.map(([p, v]) => [p, v + lo]); return g.hipsY; }
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (reachAt(mid) <= target) lo = mid; else hi = mid;
  }
  g.hipsY = base.map(([p, v]) => [p, v + lo]);
  return g.hipsY;
}

/* An ankle bends 25 degrees back and 50 forward, and no further. In a
   crouch deep enough to put the eyes at 1.20 m the knee is at a hundred
   and twenty degrees and the sole simply CANNOT lie flat: the heel is up
   and the man is on the balls of his feet. Authoring the sole's world
   angle as if it could asked for 44 degrees of dorsiflexion, got 25, and
   drove the toe 57 mm through the floor, because the height the ankle
   was placed at had been computed from the angle it did not get.

   So the two are solved together. Place the ankle from the sole angle,
   solve the leg, see what the joint can actually deliver, put the height
   back from THAT, and go round again. */
function settle(g) {
  const N = 96;
  for (const side of ['L', 'R']) {
    const L = g[side];
    L.phase = side === 'L' ? 0 : 0.5;
    L.absCurve = Array.from({ length: N + 1 }, (_, i) => [i / N, stanceAnkle(L, Math.min(i / N, L.stance * 0.999))]);
  }
  g.hipsY = Array.from({ length: N + 1 }, (_, i) => [i / N, 0]);
  for (let pass = 0; pass < 5; pass++) {
    g.hipsY = liftPelvis(g, solvePelvis(g));
    for (const side of ['L', 'R']) {
      const L = g[side];
      const a0 = localAt(g, L, L.stance - 1e-4), a1 = localAt(g, L, 0);
      L.absCurve = L.absCurve.map(([p]) => {
        const k = solveAt(g, L, p, ((p - L.phase) % 1 + 1) % 1);
        const got = Math.max(ANKLE_MIN, Math.min(ANKLE_MAX, ankleJoint(L, p, k.deg, k.hip, k.knee, a0, a1)));
        return [p, k.deg + k.hip + k.knee + got];
      });
    }
  }
  g.hipsY = liftPelvis(g, solvePelvis(g));
  return g;
}

/* ---- the three tracks for one leg ---- */
function legTracks(g, side, keys) {
  const L = g[side], hip = [], knee = [], foot = [];
  let reach = 0, lowToe = 1e9, lowHeel = 1e9, clamped = 0;
  const a0 = localAt(g, L, L.stance - 1e-4), a1 = localAt(g, L, 0);
  for (const p0 of keys) {
    const p = ((p0 + L.phase) % 1 + 1) % 1;
    const k = solveAt(g, L, p, p0);
    let fx = ankleJoint(L, p, k.deg, k.hip, k.knee, a0, a1);
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

/* Fill in a leg spec from the gait's defaults, so a symmetric gait can
   be written once and an asymmetric one only states the difference. */
function prepare(g) {
  const base = g.leg || {};
  g.L = Object.assign({}, base, g.L || {});
  g.R = Object.assign({}, base, g.R || {});
  if (!g.hipsPitch) g.hipsPitch = [[0, 0], [1, 0]];
  return settle(g);
}
module.exports = { prepare, settle, legTracks, curve, solveAt, anklePath,
  solvePelvis, soleHeight, FLOOR, LEG, ANKLE, TOE, HEEL, DEG, ANKLE_MIN, ANKLE_MAX };
