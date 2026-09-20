/* Solve one leg for a static pose: given where the pelvis is and where
   the foot has to be, what are the hip, knee and ankle keys?

   The same arithmetic the gait generator uses, exposed for the clips
   that are poses rather than cycles -- the crouch idle, the prone, the
   slide, the drop. Those were dialled in by hand and every one of them
   came out with an ankle bent further than an ankle bends (the crouch
   idle asked for 64 degrees of dorsiflexion against a limit of 25) or a
   foot through the floor.

   Usage: node engine/tools/pose-solve.js <pelvisY> <lean> <footY> <footZ> [sole]
   All angles in degrees, all distances in metres, the hips at the origin
   and the floor at -0.875. `sole` is the sole's angle to the world,
   positive toe-down; leave it out and the solver picks the flattest
   angle the ankle can actually reach. */
const THIGH = 0.42, SHIN = 0.40, LEG = THIGH + SHIN;
const HIPOFF = 0.04, FLOOR = -0.875, ANKLE = 0.017, TOE = 0.120, HEEL = 0.062;
const DEG = 180 / Math.PI;
const AMIN = -25, AMAX = 50;

function solveLeg(dy, dz) {
  const d0 = Math.hypot(dy, dz), d = Math.min(d0, LEG * 0.999);
  const PHI = Math.atan2(-dz, -dy);
  const a = Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d))));
  const b = Math.acos(Math.max(-1, Math.min(1, (SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d))));
  return { hip: (PHI - a) * DEG, knee: (a + b) * DEG, reach: d0 / LEG };
}
function soleHeight(aDeg) {
  const a = aDeg / DEG, s = Math.sin(a);
  return ANKLE * Math.cos(a) + Math.max(TOE * s, -HEEL * s);
}
/* pelvisY: the hips bone's y. lean: the hips' x key, positive forward. */
function pose(pelvisY, lean, footY, footZ, sole) {
  const hy = pelvisY - HIPOFF, pitch = lean / DEG;
  const dy = footY - hy, dz = footZ;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const k = solveLeg(dy * c + dz * s, -dy * s + dz * c);
  let ankle, world;
  if (sole == null) {
    /* Flattest sole the joint can reach. In a deep crouch the shin rakes
       so far back that flat is simply out of range and the heel lifts --
       which is what a person in a deep crouch does. */
    const want = -lean - k.hip - k.knee;
    ankle = Math.max(AMIN, Math.min(AMAX, want));
  } else {
    ankle = Math.max(AMIN, Math.min(AMAX, sole - lean - k.hip - k.knee));
  }
  world = lean + k.hip + k.knee + ankle;
  const a = world / DEG;
  return {
    hip: +k.hip.toFixed(1), knee: +k.knee.toFixed(1), ankle: +ankle.toFixed(1),
    reach: +(k.reach * 100).toFixed(1), sole: +world.toFixed(1),
    toeY: +(footY - ANKLE * Math.cos(a) - TOE * Math.sin(a)).toFixed(4),
    heelY: +(footY - ANKLE * Math.cos(a) + HEEL * Math.sin(a)).toFixed(4),
  };
}
/* The ankle height at which the sole rests on the floor for a given
   world sole angle -- so a pose can ask for "foot on the ground". */
function onFloor(sole) { return FLOOR + soleHeight(sole); }

module.exports = { pose, onFloor, soleHeight, FLOOR, ANKLE, TOE, HEEL, LEG };

if (require.main === module) {
  const [py, lean, fy, fz, sole] = process.argv.slice(2).map(Number);
  console.log(pose(py, lean, fy, fz, Number.isFinite(sole) ? sole : null));
}
