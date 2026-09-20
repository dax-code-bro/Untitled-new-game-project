/* The gaits, described the way a gait is described: where the foot goes,
   how long it is on the floor, and how much of the cycle it spends there.
   Everything about the legs and the pelvis height is solved from this.
   The trunk and the arms are authored, because nothing constrains them. */
const { curve } = require('./gait-solve.js');
const co = (pts) => (p) => curve(pts, p);

const GAITS = {
  walk: { T: 0.90, stance: 0.60, zf: 0.280, stride: 0.980, clear: 0.075, arcPeak: 0.48, retract: 0.035, kneeStance: [[0, 13], [0.18, 23], [0.42, 14], [0.66, 11], [0.84, 20], [1, 42]],
    ankle: [[0, -8], [0.10, 0], [0.62, 3], [0.82, 14], [1, 32]],
    swing: [[0, 6], [0.25, -4], [0.6, -10], [1, -12]] },
  run: { T: 0.70, stance: 0.40, zf: 0.190, stride: 1.780, clear: 0.170, arcPeak: 0.42, retract: 0.055, kneeStance: [[0, 16], [0.26, 43], [0.52, 30], [0.76, 16], [1, 34]],
    ankle: [[0, 4], [0.24, 0], [0.62, 12], [1, 42]],
    swing: [[0, 12], [0.22, -2], [0.55, -14], [1, -16]] },
  sprint: { T: 0.50, stance: 0.30, zf: 0.170, stride: 2.500, clear: 0.395, arcPeak: 0.34, retract: 0.070, kneeStance: [[0, 22], [0.28, 46], [0.56, 30], [0.80, 14], [1, 28]],
    ankle: [[0, 14], [0.30, 4], [0.64, 18], [1, 50]],
    swing: [[0, 16], [0.20, 0], [0.52, -16], [1, -20]] },
  crouchWalk: { T: 1.10, stance: 0.65, zf: 0.250, stride: 0.900, clear: 0.055, arcPeak: 0.48, retract: 0.025, kneeStance: [[0, 119], [0.22, 121], [0.50, 120], [0.78, 118], [1, 120]],
    ankle: [[0, 54], [0.20, 58], [0.62, 62], [0.86, 66], [1, 74]],
    swing: [[0, 10], [0.3, 0], [1, -6]] },
  crouchRun: { T: 0.84, stance: 0.50, zf: 0.270, stride: 1.400, clear: 0.150, arcPeak: 0.40, retract: 0.040, kneeStance: [[0, 114], [0.24, 118], [0.52, 116], [0.78, 113], [1, 116]],
    ankle: [[0, 44], [0.22, 50], [0.60, 56], [0.86, 62], [1, 72]],
    swing: [[0, 12], [0.28, -2], [1, -10]] },
};
/* Evenly spaced, and a multiple of two so that adding half a cycle maps
   the set onto itself. Phase-placed key times looked tidier but gave the
   two legs DIFFERENT sampling: the left leg got four keys through swing
   and the right got three, and the right foot dipped 7 mm through the
   floor between two of them while the left never did. A cycle whose two
   halves are the same motion should be sampled the same way in both. */
const EVEN = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
/* Every stance fraction below is a multiple of the key spacing, so
   toe-off -- the sharpest corner in the cycle -- always lands ON a key
   and never between two. Inserting an extra key at toe-off instead left
   the sprint with a ten-millisecond interval in the fastest part of its
   cycle, and the composed foot position wobbled across it: vertical
   speed 0.75 m/s, then -0.82, then +4.95, inside two hundredths of a
   cycle. Each joint was monotone between its keys; the foot they add up
   to was not. */
const KEYS = {};
for (const n in GAITS) {
  const S = GAITS[n].stance;
  if (Math.abs(S * 20 - Math.round(S * 20)) > 1e-9)
    throw new Error(`${n}: stance ${S} is not on the key grid`);
  KEYS[n] = EVEN(20);
}

/* Pelvis and trunk. Sign conventions, measured:
     hips.y NEGATIVE brings the LEFT hip forward   (R_y sends +X to -Z)
     hips.z POSITIVE raises the LEFT side          (R_z sends +X to +Y)
     +X is the left of this skeleton (upperLegL sits at x +0.09)
   Left contact is at p=0, so at p=0 the left hip leads and at p=0.25,
   left mid-stance, the weight is over the left foot. */
function trunk(lean, pelRot, list, sway, twist, headSteady, sideNod) {
  const S = [[0, 0], [0.25, 1], [0.5, 0], [0.75, -1], [1, 0]];   // +1 at left stance
  const F = [[0, -1], [0.25, 0], [0.5, 1], [0.75, 0], [1, -1]];  // +1 when the RIGHT hip leads
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
       instead of studying the floor at speed. */
    neck: (p) => [-lean * 0.62, curve(F, p) * twist * 0.30, curve(S, p) * sideNod],
    head: (p) => [-lean * headSteady, curve(F, p) * twist * 0.22, curve(S, p) * sideNod * 0.6],
  };
}
const TRUNK = {
  //        lean pelRot list  sway   twist headSteady sideNod
  walk: trunk(4, 4.0, 3.0, 0.018, 5.0, 0.30, 1.2),
  run: trunk(9, 6.5, 4.0, 0.013, 9.0, 0.42, 1.8),
  sprint: trunk(15, 8.5, 5.0, 0.009, 12.0, 0.52, 2.2),
  crouchWalk: trunk(22, 3.0, 2.0, 0.020, 3.5, 0.70, 1.0),
  crouchRun: trunk(26, 5.0, 3.0, 0.015, 6.0, 0.72, 1.4),
};

/* The arms. Contralateral: at p=0 the LEFT leg is forward, so the LEFT
   arm is BACK. upperArm.x NEGATIVE is forward and lowerArm.x NEGATIVE
   flexes the elbow -- both measured off the rig. Every one of these
   clips had the elbow POSITIVE, which is hyperextension: run at +92 and
   sprint at +112, forearms folded backwards at the elbow. */
function arms(back, fwd, elbowBack, elbowFwd, out, lead) {
  // +1 at p=0 (this arm back), -1 at p=0.5 (this arm forward)
  const W = [[0, 1], [0.25, 0], [0.5, -1], [0.75, 0], [1, 1]];
  return {
    keys: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    /* Protraction, not a shrug. The shoulder bone runs outward along
       +X on the left, so a rotation about Y sweeps it forward and back
       with its own arm -- and the first pass put it on Z, where both
       shoulders came out with identical keys and the pair read as one
       shrug repeating. */
    shoulder: (p, s) => [0, s * curve(W, p) * lead, s * 1.5],
    upper: (p, s) => {
      const w = curve(W, p);
      return [w >= 0 ? w * back : -w * fwd, 0, s * out];
    },
    lower: (p) => {
      const w = curve(W, p);
      return [elbowBack + (elbowFwd - elbowBack) * (1 - w) / 2, 0, 0];
    },
    hand: (p, s) => [curve(W, p) * -6, 0, s * 4],
  };
}
const ARMS = {
  //          back  fwd  elbowBack elbowFwd out lead
  walk: arms(14, -20, -20, -34, 7, 2.5),
  run: arms(34, -44, -64, -88, 9, 4),
  sprint: arms(52, -74, -86, -106, 11, 6),
  crouchWalk: arms(8, -12, -30, -40, 6, 1.5),
  crouchRun: arms(20, -28, -52, -70, 8, 3),
};
module.exports = { GAITS, KEYS, TRUNK, ARMS };
