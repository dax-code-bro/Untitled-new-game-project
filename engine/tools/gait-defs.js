/* The gaits, described the way a gait is described: where the foot goes,
   how long it is on the floor, and how much of the cycle it spends
   there. Everything about the legs and the pelvis height is solved from
   this by gait-solve.js. The trunk and the arms are authored, because
   nothing constrains them.

   `leg` is what both legs do; `L` and `R` state only where they differ,
   which for the living is nothing and for the dead is most of it. */
const { curve } = require('./gait-solve.js');

const GAITS = {
  /* ---------------- the living ---------------- */
  walk: {
    T: 0.90, stride: 0.980, lean: 4,
    leg: { stance: 0.60, zf: 0.280, clear: 0.075, arcPeak: 0.48,
      kneeStance: [[0, 13], [0.18, 23], [0.42, 14], [0.66, 11], [0.84, 20], [1, 42]],
      ankle: [[0, -8], [0.10, 0], [0.62, 3], [0.82, 14], [1, 32]],
      swing: [[0, 6], [0.25, -4], [0.6, -10], [1, -12]] },
  },
  run: {
    T: 0.70, stride: 1.780, lean: 9,
    leg: { stance: 0.40, zf: 0.190, clear: 0.170, arcPeak: 0.42,
      kneeStance: [[0, 16], [0.26, 43], [0.52, 30], [0.76, 16], [1, 34]],
      ankle: [[0, 4], [0.24, 0], [0.62, 12], [1, 42]],
      swing: [[0, 12], [0.22, -2], [0.55, -14], [1, -16]] },
  },
  sprint: {
    T: 0.50, stride: 2.500, lean: 15,
    leg: { stance: 0.30, zf: 0.170, clear: 0.395, arcPeak: 0.34,
      kneeStance: [[0, 22], [0.28, 46], [0.56, 30], [0.80, 14], [1, 28]],
      ankle: [[0, 14], [0.30, 4], [0.64, 18], [1, 50]],
      swing: [[0, 16], [0.20, 0], [0.52, -16], [1, -20]] },
  },
  crouchWalk: {
    T: 1.10, stride: 0.900, lean: 22,
    leg: { stance: 0.65, zf: 0.250, clear: 0.055, arcPeak: 0.48,
      kneeStance: [[0, 119], [0.22, 121], [0.50, 120], [0.78, 118], [1, 120]],
      ankle: [[0, 54], [0.20, 58], [0.62, 62], [0.86, 66], [1, 74]],
      swing: [[0, 10], [0.3, 0], [1, -6]] },
  },
  crouchRun: {
    T: 0.84, stride: 1.400, lean: 26,
    leg: { stance: 0.50, zf: 0.270, clear: 0.150, arcPeak: 0.40,
      kneeStance: [[0, 114], [0.24, 118], [0.52, 116], [0.78, 113], [1, 116]],
      ankle: [[0, 44], [0.22, 50], [0.60, 56], [0.86, 62], [1, 72]],
      swing: [[0, 12], [0.28, -2], [1, -10]] },
  },

  /* ---------------- the dead ----------------
     A shamble is not a slow walk. One leg drives and the other DRAGS,
     and a drag is three things at once: a longer time on the floor, a
     swing that barely clears it, and a toe that stays pointed so it
     scrapes. Those are leg specs, so the two legs get different ones --
     which is the whole reason gait-solve carries L and R separately. */
  zwalk: {
    T: 1.30, stride: 1.080, lean: 16,
    leg: { stance: 0.60, zf: 0.230, clear: 0.060, arcPeak: 0.46,
      kneeStance: [[0, 18], [0.20, 30], [0.50, 22], [0.78, 18], [1, 44]],
      ankle: [[0, -4], [0.14, 4], [0.66, 10], [1, 34]],
      swing: [[0, 8], [0.3, -6], [1, -8]] },
    /* THE DRAG IS A SHORT STANCE AND ALMOST NO LIFT, not a long one.
       Written as a long stance it read as a foot planted for 70% of a
       long-stride cycle -- which is 63 cm of travel on a foot that is
       supposed to be still, and the solver answered by dropping the
       pelvis 196 mm and asking the ankle for 37 degrees it has not got.
       A scraping foot is off the floor early and never gets more than a
       centimetre above it, and that is what reads as a drag. */
    R: { stance: 0.50, zf: 0.160, clear: 0.015, arcPeak: 0.55,
      kneeStance: [[0, 34], [0.30, 40], [0.70, 36], [1, 30]],
      ankle: [[0, 14], [0.40, 18], [1, 24]],
      swing: [[0, 6], [0.5, 2], [1, 4]] },
  },
  zwalk_heavy: {
    T: 1.34, stride: 0.940, lean: 12,
    leg: { stance: 0.70, zf: 0.190, clear: 0.045, arcPeak: 0.50,
      kneeStance: [[0, 26], [0.22, 44], [0.52, 34], [0.80, 26], [1, 46]],
      ankle: [[0, -2], [0.16, 6], [0.68, 14], [1, 30]],
      swing: [[0, 8], [0.3, -4], [1, -6]] },
    R: { stance: 0.70, zf: 0.170, clear: 0.038, arcPeak: 0.52,
      kneeStance: [[0, 28], [0.24, 46], [0.54, 36], [0.80, 28], [1, 44]],
      ankle: [[0, 0], [0.18, 8], [0.70, 16], [1, 30]],
      swing: [[0, 8], [0.3, -4], [1, -6]] },
  },
  zwalk_light: {
    T: 1.15, stride: 1.180, lean: 18,
    leg: { stance: 0.60, zf: 0.250, clear: 0.075, arcPeak: 0.44,
      kneeStance: [[0, 15], [0.20, 27], [0.50, 19], [0.78, 15], [1, 42]],
      ankle: [[0, -6], [0.12, 2], [0.64, 10], [1, 34]],
      swing: [[0, 8], [0.3, -8], [1, -10]] },
    R: { stance: 0.50, zf: 0.180, clear: 0.020, arcPeak: 0.54,
      kneeStance: [[0, 28], [0.30, 36], [0.70, 30], [1, 26]],
      ankle: [[0, 10], [0.40, 14], [1, 22]],
      swing: [[0, 6], [0.5, 0], [1, 2]] },
  },
  zwalk_burden: {
    T: 1.36, stride: 0.940, lean: 20,
    leg: { stance: 0.65, zf: 0.190, clear: 0.042, arcPeak: 0.50,
      kneeStance: [[0, 22], [0.22, 38], [0.52, 30], [0.80, 24], [1, 44]],
      ankle: [[0, -2], [0.16, 6], [0.68, 12], [1, 30]],
      swing: [[0, 8], [0.3, -4], [1, -6]] },
    R: { stance: 0.50, zf: 0.150, clear: 0.012, arcPeak: 0.58,
      kneeStance: [[0, 38], [0.30, 44], [0.70, 40], [1, 34]],
      ankle: [[0, 16], [0.40, 20], [1, 26]],
      swing: [[0, 4], [0.5, 2], [1, 4]] },
  },
  zlimp: {
    T: 1.52, stride: 0.700, lean: 14,
    /* A limp is the extreme of it: the sound leg carries almost the whole
       cycle and the bad one is on the floor for a quarter of it. */
    leg: { stance: 0.80, zf: 0.210, clear: 0.050, arcPeak: 0.46,
      kneeStance: [[0, 16], [0.20, 26], [0.55, 20], [0.82, 16], [1, 40]],
      ankle: [[0, -4], [0.12, 2], [0.68, 10], [1, 32]],
      swing: [[0, 8], [0.3, -6], [1, -8]] },
    R: { stance: 0.30, zf: 0.120, clear: 0.038, arcPeak: 0.56,
      kneeStance: [[0, 44], [0.40, 52], [1, 40]],
      ankle: [[0, 18], [1, 28]],
      swing: [[0, 6], [0.5, 4], [1, 6]] },
  },
  zrun: {
    T: 0.68, stride: 1.680, lean: 22,
    leg: { stance: 0.40, zf: 0.180, clear: 0.180, arcPeak: 0.40,
      kneeStance: [[0, 18], [0.26, 44], [0.52, 32], [0.76, 18], [1, 36]],
      ankle: [[0, 4], [0.24, 0], [0.62, 12], [1, 42]],
      swing: [[0, 12], [0.22, -2], [0.55, -14], [1, -16]] },
    R: { stance: 0.40, zf: 0.155, clear: 0.135, arcPeak: 0.42,
      kneeStance: [[0, 20], [0.26, 46], [0.52, 34], [0.76, 20], [1, 36]],
      ankle: [[0, 6], [0.26, 2], [0.64, 14], [1, 40]],
      swing: [[0, 12], [0.24, 0], [1, -12]] },
  },
  zrun_human: {
    T: 0.62, stride: 1.820, lean: 14,
    leg: { stance: 0.40, zf: 0.195, clear: 0.190, arcPeak: 0.40,
      kneeStance: [[0, 16], [0.26, 42], [0.52, 30], [0.76, 16], [1, 34]],
      ankle: [[0, 4], [0.24, 0], [0.62, 12], [1, 42]],
      swing: [[0, 12], [0.22, -2], [0.55, -14], [1, -16]] },
  },
  zrun_hold: {
    T: 0.74, stride: 1.540, lean: 20,
    leg: { stance: 0.40, zf: 0.180, clear: 0.150, arcPeak: 0.42,
      kneeStance: [[0, 18], [0.26, 44], [0.52, 32], [0.78, 18], [1, 36]],
      ankle: [[0, 4], [0.24, 0], [0.62, 12], [1, 40]],
      swing: [[0, 12], [0.24, -2], [1, -14]] },
    R: { stance: 0.40, zf: 0.160, clear: 0.120, arcPeak: 0.44,
      kneeStance: [[0, 20], [0.26, 46], [0.52, 34], [0.78, 20], [1, 36]],
      ankle: [[0, 6], [0.26, 2], [0.64, 14], [1, 38]],
      swing: [[0, 12], [0.26, 0], [1, -10]] },
  },
  zwade: {
    /* Chest-deep water. The feet come up high and slowly and the body
       leans into it; the stride is short because the water takes it. */
    T: 1.60, stride: 0.860, lean: 24,
    leg: { stance: 0.55, zf: 0.180, clear: 0.150, arcPeak: 0.46,
      kneeStance: [[0, 24], [0.22, 40], [0.52, 32], [0.80, 26], [1, 46]],
      ankle: [[0, 0], [0.16, 6], [0.66, 14], [1, 34]],
      swing: [[0, 10], [0.3, -10], [1, -12]] },
  },
};

/* The two legs' phases and the key grid. Every stance fraction is a
   multiple of the key spacing so that toe-off -- the sharpest corner in
   a cycle -- lands ON a key and never between two. An extra key inserted
   at toe-off instead left the sprint with a ten-millisecond interval in
   the fastest part of its cycle, and the composed foot wobbled across
   it: vertical speed 0.75 m/s, then -0.82, then +4.95. */
const EVEN = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
/* Twenty, evenly spaced, and the PELVIS IS SAMPLED ON THE SAME TWENTY.
   It used to have its own sixteen: the bob happens twice a cycle while
   the pelvic rotation happens once, and the legs' key times were once
   placed by phase rather than evenly. But two grids means the legs and
   the pelvis interpolate their own curves between their own keys, and
   the small errors no longer cancel -- the limp's bad foot dipped 40 mm
   below both of the keys it sat between, and through the floor. Forty
   keys made it worse, not better, which is what says it was never a
   sampling-rate problem. One grid. */
const KEYS = {};
for (const n in GAITS) {
  const g = GAITS[n];
  for (const side of ['leg', 'L', 'R']) {
    const S = g[side] && g[side].stance;
    if (S == null) continue;
    if (Math.abs(S * 20 - Math.round(S * 20)) > 1e-9)
      throw new Error(`${n}.${side}: stance ${S} is not on the key grid`);
  }
  KEYS[n] = EVEN(20);
}

/* Pelvis and trunk. Signs, measured:
     hips.y NEGATIVE brings the LEFT hip forward   (R_y sends +X to -Z)
     hips.z POSITIVE raises the LEFT side          (R_z sends +X to +Y)
     +X is the left of this skeleton (upperLegL sits at x +0.09)
   Left contact is at p=0, so at p=0 the left hip leads and at p=0.25,
   left mid-stance, the weight is over the left foot. */
function trunk(lean, pelRot, list, sway, twist, headSteady, sideNod, headLoll) {
  const S = [[0, 0], [0.25, 1], [0.5, 0], [0.75, -1], [1, 0]];   // +1 at left stance
  const F = [[0, -1], [0.25, 0], [0.5, 1], [0.75, 0], [1, -1]];  // +1 when the RIGHT hip leads
  const H = headLoll || 0;
  return {
    keys: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    pitch: [[0, lean], [1, lean]],
    pelvisY: F.map(([p, v]) => [p, v * pelRot]),
    list: S.map(([p, v]) => [p, v * list]),
    sway: S.map(([p, v]) => [p, v * sway]),
    /* The shoulders turn AGAINST the pelvis -- that counter-rotation is
       what stops a torso reading as a plank bolted to a pair of legs. */
    spine: (p) => [lean * 0.22, -curve(F, p) * twist * 0.35, -curve(S, p) * list * 0.30],
    chest: (p) => [lean * 0.16, -curve(F, p) * twist * 0.65, -curve(S, p) * list * 0.45],
    /* And the head gives the lean back, so the eyes stay on the horizon
       instead of studying the floor at speed. The dead give back less of
       it and never quite come level, which is `headLoll`. */
    neck: (p) => [-lean * 0.62 + H * 0.4, curve(F, p) * twist * 0.30, curve(S, p) * sideNod],
    head: (p) => [-lean * headSteady + H, curve(F, p) * twist * 0.22 - H * 0.5,
      curve(S, p) * sideNod * 0.6 - H * 0.6],
  };
}
const TRUNK = {
  //             lean pelRot list  sway   twist headSteady sideNod loll
  walk: trunk(4, 4.0, 3.0, 0.018, 5.0, 0.30, 1.2),
  run: trunk(9, 6.5, 4.0, 0.013, 9.0, 0.42, 1.8),
  sprint: trunk(15, 8.5, 5.0, 0.009, 12.0, 0.52, 2.2),
  crouchWalk: trunk(22, 3.0, 2.0, 0.020, 3.5, 0.70, 1.0),
  crouchRun: trunk(26, 5.0, 3.0, 0.015, 6.0, 0.72, 1.4),
  zwalk: trunk(16, 5.0, 5.5, 0.026, 4.0, 0.20, 2.6, 9),
  zwalk_heavy: trunk(12, 4.0, 8.0, 0.038, 3.0, 0.16, 3.2, 7),
  zwalk_light: trunk(18, 6.0, 5.0, 0.022, 5.0, 0.22, 2.4, 11),
  zwalk_burden: trunk(20, 3.5, 6.5, 0.030, 3.0, 0.18, 2.8, 8),
  zlimp: trunk(14, 3.0, 9.0, 0.042, 2.5, 0.20, 3.6, 10),
  zrun: trunk(22, 7.0, 4.5, 0.014, 8.0, 0.24, 2.0, 12),
  zrun_human: trunk(14, 7.0, 4.0, 0.013, 10.0, 0.44, 1.8, 3),
  zrun_hold: trunk(20, 6.0, 4.0, 0.014, 6.0, 0.30, 2.0, 9),
  zwade: trunk(24, 4.0, 5.0, 0.028, 4.0, 0.26, 2.2, 6),
};

/* The arms. Contralateral: at p=0 the LEFT leg is forward, so the LEFT
   arm is BACK. upperArm.x NEGATIVE is forward and lowerArm.x NEGATIVE
   flexes the elbow -- both measured off the rig. Every one of these
   clips had the elbow POSITIVE, which is hyperextension: the run at +92
   and the sprint at +112, forearms folded backwards at the elbow. */
function arms(back, fwd, elbowBack, elbowFwd, out, lead) {
  const W = [[0, 1], [0.25, 0], [0.5, -1], [0.75, 0], [1, 1]];
  return {
    keys: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    /* Protraction, not a shrug. The shoulder bone runs outward along +X
       on the left, so a rotation about Y sweeps it forward and back with
       its own arm -- and the first pass put it on Z, where both
       shoulders came out with identical keys and the pair read as one
       shrug repeating. */
    shoulder: (p, s) => [0, s * curve(W, p) * lead, s * 1.5],
    upper: (p, s) => { const w = curve(W, p); return [w >= 0 ? w * back : -w * fwd, 0, s * out]; },
    lower: (p) => { const w = curve(W, p); return [elbowBack + (elbowFwd - elbowBack) * (1 - w) / 2, 0, 0]; },
    hand: (p, s) => [curve(W, p) * -6, 0, s * 4],
  };
}
/* The dead do not counter-swing. Both arms hang out in FRONT, reaching,
   and they wander instead of matching -- so `reach` holds the pair
   forward and the swing only wobbles around it. */
function deadArms(reach, wobble, elbow, elbowSwing, out, wander) {
  const W = [[0, 1], [0.25, 0], [0.5, -1], [0.75, 0], [1, 1]];
  const V = [[0, 0], [0.3, 1], [0.62, -1], [1, 0]];
  return {
    keys: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    shoulder: (p, s) => [0, s * curve(W, p) * 2, s * 2],
    upper: (p, s) => [reach + curve(W, p) * wobble,
      s * (curve(V, p) * wander), s * (out + curve(V, p) * wander * 0.5)],
    lower: (p, s) => [elbow + curve(V, ((p + (s > 0 ? 0 : 0.37)) % 1)) * elbowSwing, 0, 0],
    hand: (p, s) => [curve(V, p) * 8, 0, s * (6 + curve(W, p) * 5)],
  };
}
const ARMS = {
  //          back  fwd  elbowBack elbowFwd out lead
  walk: arms(14, -20, -20, -34, 7, 2.5),
  run: arms(34, -44, -64, -88, 9, 4),
  sprint: arms(52, -74, -86, -106, 11, 6),
  crouchWalk: arms(8, -12, -30, -40, 6, 1.5),
  crouchRun: arms(20, -28, -52, -70, 8, 3),
  //                reach wobble elbow elbowSwing out wander
  zwalk: deadArms(-98, 8, -26, 10, 14, 7),
  zwalk_heavy: deadArms(-88, 6, -22, 8, 20, 5),
  zwalk_light: deadArms(-102, 9, -30, 12, 13, 8),
  zwalk_burden: deadArms(-52, 7, -62, 9, 16, 5),
  zlimp: deadArms(-78, 10, -34, 11, 18, 9),
  zrun: deadArms(-112, 12, -22, 14, 12, 10),
  zrun_human: arms(30, -40, -58, -80, 9, 4),
  zrun_hold: deadArms(-84, 9, -70, 10, 14, 7),
  zwade: deadArms(-104, 7, -24, 9, 16, 6),
};
module.exports = { GAITS, KEYS, TRUNK, ARMS };
