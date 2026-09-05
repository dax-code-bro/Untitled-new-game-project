/* ============================================================
   ZOMBIE ANIMATION — clips for the dead.

   Keys are [normalisedTime, xDeg, yDeg, zDeg]; an optional `pos`
   track is [normalisedTime, x, y, z] in metres.

   ---- WHICH WAY THE JOINTS GO ----
   Measured off the rig rather than guessed, because guessing is
   how the first pass ended up with every zombie's elbows bent
   backwards. Bones that point down the limb (-Y) turn the
   opposite way to the spine, which points up it (+Y):

     upperArm.x   NEGATIVE raises the arm forward.  -80 is a reach.
     lowerArm.x   NEGATIVE flexes the elbow, bringing the hand up
                  and forward. POSITIVE IS HYPEREXTENSION — a hand
                  that droops to the waist while the shoulder is
                  raised, which is what "arms just wobble and
                  nothing moves" looks like on screen.
     upperLeg.x   NEGATIVE swings the leg forward.
     lowerLeg.x   POSITIVE flexes the knee (heel toward the seat).
                  Negative is hyperextension.
     foot.x       POSITIVE lifts the toe, negative points it.
     spine/chest/hips.x  POSITIVE leans forward.

   ---- WHAT MAKES IT A WALK ----
   A gait is four things happening at once, and dropping any one
   of them leaves a figure swaying on the spot:

     stride     hips and knees through a real range, with the
                knee flexing hard in swing so the foot clears the
                floor and near-straight at contact.
     bob        the pelvis rides down at each heel strike and up
                over each mid-stance — twice per cycle. This needs
                a position track; rotations alone nail the pelvis
                to one height and the result glides.
     sway       weight shifts laterally over the stance foot,
                once per cycle, so the body is carried by a leg
                rather than floating between two.
     counter    shoulders rotate against the hips. Without it the
                torso is one rigid block above the legs.

   On top of that, the dead break the things the living hold to:
   one leg drives and the other drags, the head leads the hips
   instead of staying over them, and the arms hang out in front
   reaching rather than counter-swinging.
   ============================================================ */

function makeZombieClips() {
  const clips = [];

  /* ---------------------------------------------------------
     SHAMBLE — the default walk. Left leg drives, right drags.
     Cycle: left heel strike at 0, right heel strike at 0.5.
     --------------------------------------------------------- */
  clips.push(buildClip('zwalk', 1.70, {
    hips: {
      // Roll onto the stance leg, pelvis rotating against the shoulders.
      keys: [[0, 6, -7, 6], [0.25, 5, 0, -2], [0.5, 6, 7, -6], [0.75, 5, 0, 2], [1, 6, -7, 6]],
      // Down at each strike, up over each mid-stance; weight carried left,
      // then right. This is the track that stops it gliding.
      pos: [[0, 0.018, -0.014, 0], [0.25, 0.026, 0.018, 0], [0.5, -0.018, -0.016, 0],
            [0.75, -0.026, 0.016, 0], [1, 0.018, -0.014, 0]],
    },
    spine: { keys: [[0, 16, 6, -4], [0.25, 18, 0, 1], [0.5, 16, -6, 4], [0.75, 18, 0, -1], [1, 16, 6, -4]] },
    chest: { keys: [[0, 9, 5, -3], [0.5, 11, -5, 3], [1, 9, 5, -3]] },
    // Lolls, lags the chest, and never quite comes back to level.
    head: { keys: [[0, -10, 8, -10], [0.28, -14, 1, -13], [0.55, -7, -7, -5], [0.8, -12, 0, -9], [1, -10, 8, -10]] },

    /* Left leg drives: a full stride. Contact at 0 with the knee nearly
       straight, roll through stance, push off at 0.45, then a hard knee
       flex through swing so the foot actually clears the floor. */
    upperLegL: { keys: [[0, -26, 0, 2], [0.15, -14, 0, 2], [0.30, 0, 0, 2], [0.45, 16, 0, 2],
                        [0.55, 14, 0, 2], [0.70, -8, 0, 2], [0.85, -24, 0, 2], [1, -26, 0, 2]] },
    lowerLegL: { keys: [[0, 4, 0, 0], [0.15, 2, 0, 0], [0.30, 6, 0, 0], [0.45, 20, 0, 0],
                        [0.62, 56, 0, 0], [0.80, 30, 0, 0], [0.92, 6, 0, 0], [1, 4, 0, 0]] },
    footL: { keys: [[0, 8, 0, 0], [0.20, -2, 0, 0], [0.42, -22, 0, 0], [0.60, 10, 0, 0], [0.85, 6, 0, 0], [1, 8, 0, 0]] },

    /* Right leg drags: half the swing, a knee that never really unlocks,
       and a toe that stays down and scrapes. */
    upperLegR: { keys: [[0, 14, 0, -4], [0.15, 8, 0, -4], [0.30, -6, 0, -4], [0.50, -15, 0, -4],
                        [0.65, -8, 0, -4], [0.80, 2, 0, -4], [1, 14, 0, -4]] },
    lowerLegR: { keys: [[0, 14, 0, 0], [0.20, 22, 0, 0], [0.35, 16, 0, 0], [0.50, 8, 0, 0],
                        [0.70, 6, 0, 0], [0.85, 10, 0, 0], [1, 14, 0, 0]] },
    footR: { keys: [[0, -8, 0, 0], [0.25, -12, 0, 0], [0.50, 4, 0, 0], [0.75, -6, 0, 0], [1, -8, 0, 0]] },

    /* Arms out in front, elbows flexed, hands at chest height about half a
       metre clear of the body — and never still. Both shoulders run on all
       three axes so the reach wanders, drifts apart and comes back instead
       of locking into one pose while the legs work underneath it. */
    upperArmL: { keys: [[0, -103, 7, -16], [0.25, -95, -3, -23], [0.5, -109, 9, -12], [0.75, -99, 2, -19], [1, -103, 7, -16]] },
    upperArmR: { keys: [[0, -108, -8, 15], [0.25, -98, 4, 21], [0.5, -94, -6, 12], [0.75, -111, 3, 18], [1, -108, -8, 15]] },
    lowerArmL: { keys: [[0, -14, 0, 0], [0.30, -26, 0, 0], [0.62, -8, 0, 0], [1, -14, 0, 0]] },
    lowerArmR: { keys: [[0, -22, 0, 0], [0.30, -10, 0, 0], [0.62, -28, 0, 0], [1, -22, 0, 0]] },
    handL: { keys: [[0, 14, 0, -10], [0.5, -8, 0, 8], [1, 14, 0, -10]] },
    handR: { keys: [[0, -9, 0, 9], [0.5, 16, 0, -8], [1, -9, 0, 9]] },
  }));

  /* ---------------------------------------------------------
     HEAVY SHAMBLE — wide track, weight thrown side to side.
     --------------------------------------------------------- */
  clips.push(buildClip('zwalk_heavy', 2.05, {
    hips: {
      keys: [[0, 5, -6, 10], [0.25, 4, 0, -3], [0.5, 5, 6, -10], [0.75, 4, 0, 3], [1, 5, -6, 10]],
      // A bigger body rolls further and drops harder onto each foot.
      pos: [[0, 0.030, -0.020, 0], [0.25, 0.042, 0.016, 0], [0.5, -0.030, -0.022, 0],
            [0.75, -0.042, 0.014, 0], [1, 0.030, -0.020, 0]],
    },
    spine: { keys: [[0, 12, 5, -6], [0.25, 14, 0, 2], [0.5, 12, -5, 6], [0.75, 14, 0, -2], [1, 12, 5, -6]] },
    chest: { keys: [[0, 7, 5, -4], [0.5, 9, -5, 4], [1, 7, 5, -4]] },
    head: { keys: [[0, -7, 8, -8], [0.3, -10, 1, -10], [0.6, -5, -8, -3], [1, -7, 8, -8]] },
    // Legs swing wide and low — the feet barely clear the floor.
    upperLegL: { keys: [[0, -20, 0, 9], [0.15, -11, 0, 9], [0.32, 0, 0, 10], [0.46, 13, 0, 11],
                        [0.62, 4, 0, 11], [0.80, -12, 0, 10], [1, -20, 0, 9]] },
    lowerLegL: { keys: [[0, 6, 0, 0], [0.30, 8, 0, 0], [0.46, 18, 0, 0], [0.64, 38, 0, 0], [0.86, 12, 0, 0], [1, 6, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [0.25, -3, 0, 0], [0.45, -16, 0, 0], [0.65, 8, 0, 0], [1, 6, 0, 0]] },
    upperLegR: { keys: [[0, 12, 0, -11], [0.18, 3, 0, -11], [0.34, -8, 0, -10], [0.52, -14, 0, -9],
                        [0.70, -6, 0, -10], [0.86, 3, 0, -11], [1, 12, 0, -11]] },
    lowerLegR: { keys: [[0, 16, 0, 0], [0.16, 34, 0, 0], [0.36, 14, 0, 0], [0.52, 7, 0, 0], [0.80, 10, 0, 0], [1, 16, 0, 0]] },
    footR: { keys: [[0, -6, 0, 0], [0.3, -10, 0, 0], [0.55, 5, 0, 0], [1, -6, 0, 0]] },
    // Reaching, but pushed wide by the trunk and rolling with it.
    upperArmL: { keys: [[0, -89, 8, -40], [0.3, -81, -3, -46], [0.6, -97, 10, -35], [1, -89, 8, -40]] },
    upperArmR: { keys: [[0, -95, -9, 38], [0.3, -84, 5, 44], [0.6, -80, -7, 34], [1, -95, -9, 38]] },
    lowerArmL: { keys: [[0, -18, 0, 0], [0.35, -30, 0, 0], [0.7, -12, 0, 0], [1, -18, 0, 0]] },
    lowerArmR: { keys: [[0, -26, 0, 0], [0.35, -14, 0, 0], [0.7, -32, 0, 0], [1, -26, 0, 0]] },
    handL: { keys: [[0, 12, 0, -8], [0.5, -9, 0, 9], [1, 12, 0, -8]] },
    handR: { keys: [[0, -11, 0, 8], [0.5, 15, 0, -8], [1, -11, 0, 8]] },
  }));

  /* ---------------------------------------------------------
     LIGHT SHAMBLE — narrower track, more hip, quicker.
     --------------------------------------------------------- */
  clips.push(buildClip('zwalk_light', 1.45, {
    hips: {
      keys: [[0, 6, -8, 8], [0.25, 5, 0, -3], [0.5, 6, 8, -8], [0.75, 5, 0, 3], [1, 6, -8, 8]],
      pos: [[0, 0.014, -0.012, 0], [0.25, 0.020, 0.020, 0], [0.5, -0.014, -0.014, 0],
            [0.75, -0.020, 0.018, 0], [1, 0.014, -0.012, 0]],
    },
    spine: { keys: [[0, 15, 7, -3], [0.25, 17, 0, 1], [0.5, 15, -7, 3], [0.75, 17, 0, -1], [1, 15, 7, -3]] },
    chest: { keys: [[0, 11, 5, -2], [0.5, 13, -5, 2], [1, 11, 5, -2]] },
    head: { keys: [[0, -12, 9, -12], [0.3, -16, 2, -14], [0.6, -8, -8, -6], [1, -12, 9, -12]] },
    upperLegL: { keys: [[0, -30, 0, -2], [0.15, -16, 0, -2], [0.30, 0, 0, -2], [0.45, 18, 0, -2],
                        [0.55, 15, 0, -2], [0.70, -10, 0, -2], [0.85, -28, 0, -2], [1, -30, 0, -2]] },
    lowerLegL: { keys: [[0, 3, 0, 0], [0.15, 2, 0, 0], [0.30, 6, 0, 0], [0.45, 20, 0, 0],
                        [0.62, 50, 0, 0], [0.80, 28, 0, 0], [0.92, 5, 0, 0], [1, 3, 0, 0]] },
    footL: { keys: [[0, 9, 0, 0], [0.20, -2, 0, 0], [0.42, -24, 0, 0], [0.60, 12, 0, 0], [1, 9, 0, 0]] },
    upperLegR: { keys: [[0, 16, 0, 2], [0.15, 9, 0, 2], [0.30, -7, 0, 2], [0.50, -18, 0, 2],
                        [0.65, -9, 0, 2], [0.80, 3, 0, 2], [1, 16, 0, 2]] },
    lowerLegR: { keys: [[0, 15, 0, 0], [0.20, 26, 0, 0], [0.35, 17, 0, 0], [0.50, 7, 0, 0], [0.85, 10, 0, 0], [1, 15, 0, 0]] },
    footR: { keys: [[0, -9, 0, 0], [0.25, -13, 0, 0], [0.50, 5, 0, 0], [1, -9, 0, 0]] },
    upperArmL: { keys: [[0, -106, 8, -14], [0.3, -96, -5, -21], [0.6, -112, 10, -10], [1, -106, 8, -14]] },
    upperArmR: { keys: [[0, -110, -9, 13], [0.3, -99, 6, 19], [0.6, -95, -8, 10], [1, -110, -9, 13]] },
    lowerArmL: { keys: [[0, -10, 0, 0], [0.3, -24, 0, 0], [0.62, -6, 0, 0], [1, -10, 0, 0]] },
    lowerArmR: { keys: [[0, -20, 0, 0], [0.3, -8, 0, 0], [0.62, -26, 0, 0], [1, -20, 0, 0]] },
    handL: { keys: [[0, 17, 0, -11], [0.5, -8, 0, 9], [1, 17, 0, -11]] },
    handR: { keys: [[0, -10, 0, 10], [0.5, 19, 0, -8], [1, -10, 0, 10]] },
  }));

  /* ---------------------------------------------------------
     SPRINT — the ones that run. Deep forward lean, long stride,
     a real flight phase, and hands clawing ahead of the body.
     --------------------------------------------------------- */
  clips.push(buildClip('zrun', 0.68, {
    hips: {
      keys: [[0, 14, -9, 3], [0.25, 13, 0, 0], [0.5, 14, 9, -3], [0.75, 13, 0, 0], [1, 14, -9, 3]],
      // Driven down onto each foot and thrown up off it: a run is mostly
      // this. Twice the travel of the walk.
      pos: [[0, 0.014, -0.034, 0], [0.18, 0.020, 0.026, 0], [0.5, -0.014, -0.036, 0],
            [0.68, -0.020, 0.024, 0], [1, 0.014, -0.034, 0]],
    },
    spine: { keys: [[0, 25, 6, 0], [0.25, 27, 0, 0], [0.5, 25, -6, 0], [0.75, 27, 0, 0], [1, 25, 6, 0]] },
    chest: { keys: [[0, 13, 6, 0], [0.5, 15, -6, 0], [1, 13, 6, 0]] },
    // Head thrust out ahead of the body — running at you, not with you.
    head: { keys: [[0, -30, 5, -5], [0.5, -33, -5, 5], [1, -30, 5, -5]] },
    upperLegL: { keys: [[0, -42, 0, 0], [0.14, -20, 0, 0], [0.28, 4, 0, 0], [0.42, 27, 0, 0],
                        [0.58, 4, 0, 0], [0.78, -27, 0, 0], [1, -42, 0, 0]] },
    lowerLegL: { keys: [[0, 12, 0, 0], [0.18, 4, 0, 0], [0.42, 26, 0, 0], [0.58, 74, 0, 0],
                        [0.76, 44, 0, 0], [0.92, 14, 0, 0], [1, 12, 0, 0]] },
    footL: { keys: [[0, 10, 0, 0], [0.22, -6, 0, 0], [0.42, -28, 0, 0], [0.62, 14, 0, 0], [1, 10, 0, 0]] },
    upperLegR: { keys: [[0, 27, 0, 0], [0.08, 4, 0, 0], [0.28, -27, 0, 0], [0.5, -42, 0, 0],
                        [0.64, -20, 0, 0], [0.78, 4, 0, 0], [1, 27, 0, 0]] },
    lowerLegR: { keys: [[0, 26, 0, 0], [0.08, 74, 0, 0], [0.26, 44, 0, 0], [0.42, 14, 0, 0],
                        [0.5, 12, 0, 0], [0.68, 4, 0, 0], [0.92, 26, 0, 0], [1, 26, 0, 0]] },
    footR: { keys: [[0, -28, 0, 0], [0.12, 14, 0, 0], [0.5, 10, 0, 0], [0.72, -6, 0, 0], [1, -28, 0, 0]] },
    /* Arms reach rather than pump, and they claw: the elbows open and close
       across the stride so the hands snatch at the air in front. */
    upperArmL: { keys: [[0, -113, 4, -20], [0.3, -101, -6, -28], [0.6, -123, 6, -16], [1, -113, 4, -20]] },
    upperArmR: { keys: [[0, -121, -5, 19], [0.3, -109, 5, 26], [0.6, -103, -7, 15], [1, -121, -5, 19]] },
    lowerArmL: { keys: [[0, -12, 0, 0], [0.3, -36, 0, 0], [0.6, -6, 0, 0], [1, -12, 0, 0]] },
    lowerArmR: { keys: [[0, -32, 0, 0], [0.3, -8, 0, 0], [0.6, -38, 0, 0], [1, -32, 0, 0]] },
    handL: { keys: [[0, 20, 0, -12], [0.5, -12, 0, 10], [1, 20, 0, -12]] },
    handR: { keys: [[0, -12, 0, 11], [0.5, 22, 0, -10], [1, -12, 0, 11]] },
  }));

  /* ---------------------------------------------------------
     REMEMBERED SPRINT — the few seconds where it runs like a
     person again.

     Everything the shamble breaks on purpose, this puts back:
     the arms counter-swing at the shoulder with the elbows held
     at ninety, the legs are symmetric, the head stays over the
     centre of mass, and the pelvis drives cleanly. Played
     against zrun it reads as a body remembering how this used to
     work — which is the only reason to have a correct human
     sprint in a game with no humans left in it.
     --------------------------------------------------------- */
  clips.push(buildClip('zrun_human', 0.62, {
    hips: {
      keys: [[0, 8, -10, 2], [0.25, 8, 0, 0], [0.5, 8, 10, -2], [0.75, 8, 0, 0], [1, 8, -10, 2]],
      pos: [[0, 0.010, -0.030, 0], [0.20, 0.014, 0.030, 0], [0.5, -0.010, -0.030, 0],
            [0.70, -0.014, 0.030, 0], [1, 0.010, -0.030, 0]],
    },
    spine: { keys: [[0, 15, 8, 0], [0.25, 16, 0, 0], [0.5, 15, -8, 0], [0.75, 16, 0, 0], [1, 15, 8, 0]] },
    chest: { keys: [[0, 6, 7, 0], [0.5, 7, -7, 0], [1, 6, 7, 0]] },
    // Head level and forward, over the feet rather than ahead of them.
    head: { keys: [[0, -10, 4, 0], [0.5, -11, -4, 0], [1, -10, 4, 0]] },
    upperLegL: { keys: [[0, -46, 0, 0], [0.14, -20, 0, 0], [0.30, 6, 0, 0], [0.44, 30, 0, 0],
                        [0.60, 2, 0, 0], [0.80, -30, 0, 0], [1, -46, 0, 0]] },
    lowerLegL: { keys: [[0, 14, 0, 0], [0.18, 4, 0, 0], [0.44, 24, 0, 0], [0.60, 88, 0, 0],
                        [0.78, 42, 0, 0], [0.92, 12, 0, 0], [1, 14, 0, 0]] },
    footL: { keys: [[0, 12, 0, 0], [0.22, -4, 0, 0], [0.44, -26, 0, 0], [0.64, 14, 0, 0], [1, 12, 0, 0]] },
    upperLegR: { keys: [[0, 30, 0, 0], [0.10, 2, 0, 0], [0.30, -30, 0, 0], [0.5, -46, 0, 0],
                        [0.64, -20, 0, 0], [0.80, 6, 0, 0], [1, 30, 0, 0]] },
    lowerLegR: { keys: [[0, 24, 0, 0], [0.10, 88, 0, 0], [0.28, 42, 0, 0], [0.42, 12, 0, 0],
                        [0.5, 14, 0, 0], [0.68, 4, 0, 0], [0.94, 24, 0, 0], [1, 24, 0, 0]] },
    footR: { keys: [[0, -26, 0, 0], [0.14, 14, 0, 0], [0.5, 12, 0, 0], [0.72, -4, 0, 0], [1, -26, 0, 0]] },
    /* Arms driving, not reaching: elbows locked near ninety, shoulders
       swinging opposite the legs. */
    upperArmL: { keys: [[0, -58, 0, -8], [0.5, 26, 0, -8], [1, -58, 0, -8]] },
    upperArmR: { keys: [[0, 26, 0, 8], [0.5, -58, 0, 8], [1, 26, 0, 8]] },
    lowerArmL: { keys: [[0, -88, 0, 0], [0.5, -74, 0, 0], [1, -88, 0, 0]] },
    lowerArmR: { keys: [[0, -74, 0, 0], [0.5, -88, 0, 0], [1, -74, 0, 0]] },
    handL: { keys: [[0, 0, 0, 0], [1, 0, 0, 0]] },
    handR: { keys: [[0, 0, 0, 0], [1, 0, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     CRAWL — no working legs, hauling on the arms.
     The skeleton stays upright, so the crawl is made by folding
     the whole figure at the hips and packing the legs away
     behind it. Rotating the actor instead would fight the
     controller, which owns yaw and nothing else.
     --------------------------------------------------------- */
  clips.push(buildClip('zcrawl', 1.6, {
    hips: {
      keys: [[0, 74, -8, 0], [0.5, 78, 8, 0], [1, 74, -8, 0]],
      // Hauled forward in surges, and the whole body drops between them.
      pos: [[0, 0.010, -0.030, 0], [0.35, 0.014, -0.010, 0], [0.7, -0.012, -0.034, 0], [1, 0.010, -0.030, 0]],
    },
    spine: { keys: [[0, -16, 5, 0], [0.5, -20, -5, 0], [1, -16, 5, 0]] },
    chest: { keys: [[0, -10, 7, 0], [0.5, -8, -7, 0], [1, -10, 7, 0]] },
    head: { keys: [[0, -46, 7, 0], [0.5, -44, -7, 0], [1, -46, 7, 0]] },
    // Legs folded up and back, dragging uselessly.
    upperLegL: { keys: [[0, -72, 0, 10], [0.5, -66, 0, 12], [1, -72, 0, 10]] },
    upperLegR: { keys: [[0, -66, 0, -12], [0.5, -72, 0, -10], [1, -66, 0, -12]] },
    lowerLegL: { keys: [[0, 84, 0, 0], [0.5, 76, 0, 0], [1, 84, 0, 0]] },
    lowerLegR: { keys: [[0, 76, 0, 0], [0.5, 84, 0, 0], [1, 76, 0, 0]] },
    // Arms alternate: plant far forward, then haul the body over the hand.
    upperArmL: { keys: [[0, -100, 0, -16], [0.35, -44, 0, -24], [0.7, -22, 0, -18], [1, -100, 0, -16]] },
    upperArmR: { keys: [[0, -22, 0, 18], [0.35, -100, 0, 16], [0.7, -54, 0, 24], [1, -22, 0, 18]] },
    lowerArmL: { keys: [[0, -8, 0, 0], [0.35, -46, 0, 0], [1, -8, 0, 0]] },
    lowerArmR: { keys: [[0, -46, 0, 0], [0.35, -8, 0, 0], [1, -46, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     TEARING AT A BARRICADE — both arms haul boards off the wall,
     out of phase, so the pull never stops. The whole body works:
     the legs brace and the pelvis drives each pull.
     --------------------------------------------------------- */
  clips.push(buildClip('ztear', 1.05, {
    hips: {
      keys: [[0, 2, 6, 0], [0.28, 8, -4, 0], [0.55, 3, -6, 0], [0.8, 9, 4, 0], [1, 2, 6, 0]],
      pos: [[0, 0.008, -0.008, 0.010], [0.28, -0.006, 0.006, -0.014], [0.55, -0.008, -0.008, 0.010],
            [0.8, 0.006, 0.006, -0.014], [1, 0.008, -0.008, 0.010]],
    },
    spine: { keys: [[0, 12, -8, 0], [0.28, 22, 6, 0], [0.55, 13, 8, 0], [0.8, 21, -6, 0], [1, 12, -8, 0]] },
    chest: { keys: [[0, 6, -9, 0], [0.5, 10, 9, 0], [1, 6, -9, 0]] },
    head: { keys: [[0, -14, -7, -4], [0.5, -18, 7, 4], [1, -14, -7, -4]] },
    // Reach high onto the plank, then wrench down and back.
    upperArmL: { keys: [[0, -122, 0, -18], [0.28, -34, 0, -30], [0.55, -114, 0, -20], [1, -122, 0, -18]] },
    upperArmR: { keys: [[0, -38, 0, 26], [0.28, -118, 0, 18], [0.55, -34, 0, 30], [1, -38, 0, 26]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.28, -62, 0, 0], [1, -20, 0, 0]] },
    lowerArmR: { keys: [[0, -58, 0, 0], [0.28, -18, 0, 0], [1, -58, 0, 0]] },
    // Braced: one foot forward, and the legs take each pull.
    upperLegL: { keys: [[0, -14, 0, 4], [0.28, -6, 0, 4], [1, -14, 0, 4]] },
    upperLegR: { keys: [[0, 6, 0, -5], [0.28, 12, 0, -5], [1, 6, 0, -5]] },
    lowerLegL: { keys: [[0, 16, 0, 0], [0.28, 6, 0, 0], [1, 16, 0, 0]] },
    lowerLegR: { keys: [[0, 8, 0, 0], [0.28, 20, 0, 0], [1, 8, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     LUNGE — the swipe that lands a hit. The elbows open as the
     arms go out: a strike is an extension, not a wave.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack', 0.62, {
    hips: {
      keys: [[0, 2, 0, 0], [0.35, 14, 0, 0], [1, 2, 0, 0]],
      pos: [[0, 0, 0, 0], [0.35, 0, 0.020, 0.055], [0.7, 0, -0.010, 0.010], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 14, 0, 0], [0.35, 28, 0, 0], [1, 14, 0, 0]] },
    chest: { keys: [[0, 8, 0, 0], [0.35, 14, 0, 0], [1, 8, 0, 0]] },
    head: { keys: [[0, -12, 0, 0], [0.35, -32, 0, 0], [1, -12, 0, 0]] },
    upperArmL: { keys: [[0, -46, 0, -18], [0.30, -118, 0, -32], [0.60, -92, 0, -10], [1, -46, 0, -18]] },
    upperArmR: { keys: [[0, -50, 0, 18], [0.36, -122, 0, 32], [0.66, -88, 0, 10], [1, -50, 0, 18]] },
    // Cocked and flexed, then snapped almost straight on the strike.
    lowerArmL: { keys: [[0, -52, 0, 0], [0.30, -6, 0, 0], [0.60, -20, 0, 0], [1, -52, 0, 0]] },
    lowerArmR: { keys: [[0, -56, 0, 0], [0.36, -5, 0, 0], [0.66, -22, 0, 0], [1, -56, 0, 0]] },
    upperLegL: { keys: [[0, -8, 0, 3], [0.35, -22, 0, 3], [1, -8, 0, 3]] },
    upperLegR: { keys: [[0, 6, 0, -4], [0.35, 16, 0, -4], [1, 6, 0, -4]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.35, 22, 0, 0], [1, 10, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.35, 6, 0, 0], [1, 12, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     THE HOOK — one arm only, swung round on a turning body.
     The heavy ones do this: they have the mass to put behind it
     and none of the speed to do anything else. The hips lead and
     the arm arrives late, which is what a swing is.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack_hook', 0.82, {
    hips: {
      keys: [[0, 2, -22, 0], [0.30, 6, -30, 0], [0.55, 10, 26, 0], [1, 2, -22, 0]],
      pos: [[0, 0, 0, 0], [0.55, 0, 0.012, 0.070], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 12, -14, 0], [0.30, 16, -20, 0], [0.55, 20, 18, 0], [1, 12, -14, 0]] },
    chest: { keys: [[0, 7, -10, 0], [0.55, 12, 14, 0], [1, 7, -10, 0]] },
    head: { keys: [[0, -10, -12, 0], [0.55, -22, 12, 0], [1, -10, -12, 0]] },
    // The left arm cocks back behind the body, then comes across the front.
    upperArmL: { keys: [[0, -40, 0, -14], [0.30, -30, -46, -30], [0.58, -104, 44, -46], [1, -40, 0, -14]] },
    lowerArmL: { keys: [[0, -48, 0, 0], [0.30, -70, 0, 0], [0.58, -14, 0, 0], [1, -48, 0, 0]] },
    // The right hangs and trails, which is most of why it reads as one arm.
    upperArmR: { keys: [[0, -34, 0, 12], [0.55, -48, 0, 22], [1, -34, 0, 12]] },
    lowerArmR: { keys: [[0, -40, 0, 0], [0.55, -30, 0, 0], [1, -40, 0, 0]] },
    upperLegL: { keys: [[0, -6, 0, 3], [0.55, -26, 0, 3], [1, -6, 0, 3]] },
    upperLegR: { keys: [[0, 5, 0, -4], [0.55, 20, 0, -4], [1, 5, 0, -4]] },
    lowerLegL: { keys: [[0, 9, 0, 0], [0.55, 26, 0, 0], [1, 9, 0, 0]] },
    lowerLegR: { keys: [[0, 11, 0, 0], [0.55, 4, 0, 0], [1, 11, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     THE GRAB — both hands out and closing, the head following
     them in. The walkers do this. It is slower than the swipe
     and it commits the whole body forward, which is why it is
     the one that gets them shot.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack_grab', 0.90, {
    hips: {
      keys: [[0, 3, 0, 0], [0.45, 18, 0, 0], [1, 3, 0, 0]],
      pos: [[0, 0, 0, 0], [0.45, 0, -0.030, 0.110], [0.75, 0, -0.010, 0.030], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 13, 0, 0], [0.45, 30, 0, 0], [1, 13, 0, 0]] },
    chest: { keys: [[0, 8, 0, 0], [0.45, 16, 0, 0], [1, 8, 0, 0]] },
    head: { keys: [[0, -12, 0, 0], [0.45, -40, 0, 0], [0.8, -26, 0, 0], [1, -12, 0, 0]] },
    // Straight out, wide, then closing in on each other at the end.
    upperArmL: { keys: [[0, -44, 0, -16], [0.42, -96, 0, -34], [0.68, -92, 0, -8], [1, -44, 0, -16]] },
    upperArmR: { keys: [[0, -44, 0, 16], [0.42, -96, 0, 34], [0.68, -92, 0, 8], [1, -44, 0, 16]] },
    lowerArmL: { keys: [[0, -50, 0, 0], [0.42, -12, 0, 0], [0.68, -34, 0, 0], [1, -50, 0, 0]] },
    lowerArmR: { keys: [[0, -50, 0, 0], [0.42, -12, 0, 0], [0.68, -34, 0, 0], [1, -50, 0, 0]] },
    handL: { keys: [[0, 0, 0, -10], [0.42, 0, 0, -22], [0.70, 0, 0, 14], [1, 0, 0, -10]] },
    handR: { keys: [[0, 0, 0, 10], [0.42, 0, 0, 22], [0.70, 0, 0, -14], [1, 0, 0, 10]] },
    upperLegL: { keys: [[0, -8, 0, 3], [0.45, -30, 0, 3], [1, -8, 0, 3]] },
    upperLegR: { keys: [[0, 6, 0, -4], [0.45, 22, 0, -4], [1, 6, 0, -4]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.45, 30, 0, 0], [1, 10, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.45, 4, 0, 0], [1, 12, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     THE BITE — the runners do not swing. They arrive, the hands
     take hold of whatever is in front, and the head drives in.
     Short and fast, and the arms pull inward rather than push.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack_bite', 0.48, {
    hips: {
      keys: [[0, 6, 0, 0], [0.30, 22, 0, 0], [1, 6, 0, 0]],
      pos: [[0, 0, 0, 0], [0.30, 0, -0.020, 0.130], [0.65, 0, 0, 0.040], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 18, 0, 0], [0.30, 36, 0, 0], [1, 18, 0, 0]] },
    chest: { keys: [[0, 10, 0, 0], [0.30, 20, 0, 0], [1, 10, 0, 0]] },
    // The head is the weapon: it goes furthest and it goes last.
    head: { keys: [[0, -14, 0, 0], [0.24, -20, 0, 0], [0.44, -54, 0, 0], [0.72, -30, 0, 0], [1, -14, 0, 0]] },
    upperArmL: { keys: [[0, -50, 0, -20], [0.26, -104, 0, -30], [0.52, -76, 0, -6], [1, -50, 0, -20]] },
    upperArmR: { keys: [[0, -50, 0, 20], [0.26, -104, 0, 30], [0.52, -76, 0, 6], [1, -50, 0, 20]] },
    // Cocked, thrown out, then hauled back in — a pull, not a push.
    lowerArmL: { keys: [[0, -56, 0, 0], [0.26, -18, 0, 0], [0.52, -84, 0, 0], [1, -56, 0, 0]] },
    lowerArmR: { keys: [[0, -56, 0, 0], [0.26, -18, 0, 0], [0.52, -84, 0, 0], [1, -56, 0, 0]] },
    upperLegL: { keys: [[0, -10, 0, 3], [0.30, -34, 0, 3], [1, -10, 0, 3]] },
    upperLegR: { keys: [[0, 8, 0, -4], [0.30, 26, 0, -4], [1, 8, 0, -4]] },
    lowerLegL: { keys: [[0, 12, 0, 0], [0.30, 34, 0, 0], [1, 12, 0, 0]] },
    lowerLegR: { keys: [[0, 14, 0, 0], [0.30, 2, 0, 0], [1, 14, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     THE RAKE — from the floor. A crawler cannot swing at a
     standing man's chest, so it goes for the ankles: one arm
     sweeps across the ground while the shoulders roll behind it.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack_rake', 0.66, {
    hips: {
      keys: [[0, 78, -8, 0], [0.35, 80, -16, 0], [0.6, 78, 12, 0], [1, 78, -8, 0]],
      pos: [[0, 0, 0, 0], [0.4, 0, 0.020, 0.060], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, -18, -10, 0], [0.4, -26, -18, 0], [0.62, -22, 14, 0], [1, -18, -10, 0]] },
    chest: { keys: [[0, -10, -6, 0], [0.62, -14, 10, 0], [1, -10, -6, 0]] },
    head: { keys: [[0, -46, -8, 0], [0.4, -58, -14, 0], [0.62, -52, 12, 0], [1, -46, -8, 0]] },
    upperArmR: { keys: [[0, -62, 0, 24], [0.32, -40, -30, 40], [0.60, -96, 36, 18], [1, -62, 0, 24]] },
    lowerArmR: { keys: [[0, -34, 0, 0], [0.32, -58, 0, 0], [0.60, -8, 0, 0], [1, -34, 0, 0]] },
    upperArmL: { keys: [[0, -74, 0, -20], [0.5, -80, 0, -26], [1, -74, 0, -20]] },
    lowerArmL: { keys: [[0, -24, 0, 0], [0.5, -18, 0, 0], [1, -24, 0, 0]] },
    upperLegL: { keys: [[0, -34, 0, 6], [0.5, -42, 0, 6], [1, -34, 0, 6]] },
    upperLegR: { keys: [[0, -30, 0, -6], [0.5, -22, 0, -6], [1, -30, 0, -6]] },
    lowerLegL: { keys: [[0, 62, 0, 0], [0.5, 70, 0, 0], [1, 62, 0, 0]] },
    lowerLegR: { keys: [[0, 58, 0, 0], [0.5, 50, 0, 0], [1, 58, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     THE OVERHEAD — both arms up and brought down together. The
     armoured one and the boss, who are too heavy to reach and too
     slow to be stopped once it has started.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack_slam', 1.05, {
    hips: {
      keys: [[0, 2, 0, 0], [0.36, -8, 0, 0], [0.58, 22, 0, 0], [1, 2, 0, 0]],
      pos: [[0, 0, 0, 0], [0.36, 0, 0.055, -0.030], [0.60, 0, -0.055, 0.085], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 12, 0, 0], [0.36, -12, 0, 0], [0.58, 34, 0, 0], [1, 12, 0, 0]] },
    chest: { keys: [[0, 8, 0, 0], [0.36, -8, 0, 0], [0.58, 20, 0, 0], [1, 8, 0, 0]] },
    head: { keys: [[0, -10, 0, 0], [0.36, 6, 0, 0], [0.58, -44, 0, 0], [1, -10, 0, 0]] },
    // All the way overhead on the wind-up, all the way down on the strike.
    upperArmL: { keys: [[0, -44, 0, -16], [0.36, -166, 0, -20], [0.60, -34, 0, -12], [1, -44, 0, -16]] },
    upperArmR: { keys: [[0, -44, 0, 16], [0.36, -166, 0, 20], [0.60, -34, 0, 12], [1, -44, 0, 16]] },
    lowerArmL: { keys: [[0, -46, 0, 0], [0.36, -30, 0, 0], [0.60, -6, 0, 0], [1, -46, 0, 0]] },
    lowerArmR: { keys: [[0, -46, 0, 0], [0.36, -30, 0, 0], [0.60, -6, 0, 0], [1, -46, 0, 0]] },
    upperLegL: { keys: [[0, -8, 0, 3], [0.36, 4, 0, 3], [0.58, -30, 0, 3], [1, -8, 0, 3]] },
    upperLegR: { keys: [[0, 6, 0, -4], [0.36, -4, 0, -4], [0.58, 24, 0, -4], [1, 6, 0, -4]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.58, 34, 0, 0], [1, 10, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.58, 2, 0, 0], [1, 12, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     TEARING A PIECE OUT OF ITSELF — the far arm crosses the
     body, digs into the flank and pulls. The spine folds around
     the hand rather than the hand simply arriving at the ribs,
     which is the difference between reaching for something and
     wrenching something loose.
     --------------------------------------------------------- */
  clips.push(buildClip('zrip', 1.25, {
    hips: {
      keys: [[0, 3, 6, 0], [0.4, 5, 14, 0], [0.7, 4, 4, 0], [1, 3, 6, 0]],
      pos: [[0, 0, 0, 0], [0.4, -0.012, -0.014, 0], [0.7, 0.010, 0.004, 0], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 14, -10, -6], [0.4, 26, -24, -16], [0.7, 16, -8, -6], [1, 14, -10, -6]] },
    chest: { keys: [[0, 8, -8, -4], [0.4, 15, -20, -11], [1, 8, -8, -4]] },
    head: { keys: [[0, -14, -12, 0], [0.4, -4, -28, -8], [0.75, -20, -6, 0], [1, -14, -12, 0]] },
    // Right hand crosses to the left flank, grips, and hauls outward. The
    // elbow has to fold hard for the hand to reach the ribs at all.
    upperArmR: { keys: [[0, -32, 0, 34], [0.3, -66, 0, 62], [0.5, -60, 0, 58], [0.75, -40, 0, 22], [1, -32, 0, 34]] },
    lowerArmR: { keys: [[0, -40, 0, 0], [0.3, -108, 0, 0], [0.5, -96, 0, 0], [0.75, -34, 0, 0], [1, -40, 0, 0]] },
    handR: { keys: [[0, 0, 0, 0], [0.3, 18, 0, 0], [0.55, -14, 0, 0], [1, 0, 0, 0]] },
    upperArmL: { keys: [[0, -60, 0, -18], [0.4, -44, 0, -32], [1, -60, 0, -18]] },
    lowerArmL: { keys: [[0, -24, 0, 0], [0.4, -40, 0, 0], [1, -24, 0, 0]] },
    upperLegL: { keys: [[0, -6, 0, 4], [0.4, -14, 0, 4], [1, -6, 0, 4]] },
    upperLegR: { keys: [[0, 4, 0, -4], [0.4, 10, 0, -4], [1, 4, 0, -4]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.4, 20, 0, 0], [1, 10, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.4, 6, 0, 0], [1, 12, 0, 0]] },
  }, { loop: false }));

  /* ---- the last one: tearing at its own face ---- */
  clips.push(buildClip('zripface', 1.35, {
    hips: {
      keys: [[0, 4, 0, 0], [0.45, 8, 0, 0], [1, 4, 0, 0]],
      pos: [[0, 0, 0, 0], [0.3, 0, -0.018, -0.012], [0.62, 0, 0.010, 0.008], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 14, 0, 0], [0.45, 24, 0, 0], [1, 14, 0, 0]] },
    chest: { keys: [[0, 8, 0, 0], [0.45, 13, 0, 0], [1, 8, 0, 0]] },
    head: { keys: [[0, -12, 0, 0], [0.35, 18, 8, 0], [0.7, 2, -6, 0], [1, -12, 0, 0]] },
    // Both hands to the face, then wrenched away and down. Hands only get
    // to a face with the elbows folded right up.
    upperArmR: { keys: [[0, -36, 0, 30], [0.3, -104, 0, 30], [0.55, -96, 0, 38], [0.8, -52, 0, 24], [1, -36, 0, 30]] },
    upperArmL: { keys: [[0, -36, 0, -30], [0.3, -102, 0, -30], [0.55, -94, 0, -38], [0.8, -48, 0, -24], [1, -36, 0, -30]] },
    lowerArmR: { keys: [[0, -40, 0, 0], [0.3, -104, 0, 0], [0.55, -92, 0, 0], [0.8, -30, 0, 0], [1, -40, 0, 0]] },
    lowerArmL: { keys: [[0, -40, 0, 0], [0.3, -102, 0, 0], [0.55, -90, 0, 0], [0.8, -28, 0, 0], [1, -40, 0, 0]] },
    handR: { keys: [[0, 0, 0, 0], [0.35, 22, 0, 0], [0.6, -18, 0, 0], [1, 0, 0, 0]] },
    handL: { keys: [[0, 0, 0, 0], [0.35, 20, 0, 0], [0.6, -16, 0, 0], [1, 0, 0, 0]] },
    upperLegL: { keys: [[0, -6, 0, 5], [0.45, -16, 0, 5], [1, -6, 0, 5]] },
    upperLegR: { keys: [[0, -4, 0, -5], [0.45, -14, 0, -5], [1, -4, 0, -5]] },
    lowerLegL: { keys: [[0, 12, 0, 0], [0.45, 26, 0, 0], [1, 12, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.45, 24, 0, 0], [1, 12, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     THROW — winds the arm back over the shoulder with the elbow
     folded, then whips it through and opens the elbow at
     release. The hips and the far arm counter it.
     --------------------------------------------------------- */
  clips.push(buildClip('zspit', 0.95, {
    hips: {
      keys: [[0, 2, -16, 0], [0.45, 6, 18, 0], [1, 2, -16, 0]],
      pos: [[0, 0, 0, -0.014], [0.45, 0, 0.008, 0.020], [1, 0, 0, -0.014]],
    },
    spine: { keys: [[0, 10, -22, 0], [0.45, 20, 24, 0], [1, 10, -22, 0]] },
    chest: { keys: [[0, 6, -18, 0], [0.45, 9, 20, 0], [1, 6, -18, 0]] },
    head: { keys: [[0, -18, -10, 0], [0.45, -26, 9, 0], [1, -18, -10, 0]] },
    // Cocked behind the head with the elbow shut, then thrown open.
    upperArmR: { keys: [[0, -24, 0, 40], [0.30, -128, 0, 34], [0.50, -74, 0, 14], [0.68, -40, 0, 24], [1, -24, 0, 40]] },
    lowerArmR: { keys: [[0, -34, 0, 0], [0.30, -112, 0, 0], [0.50, -8, 0, 0], [0.68, -26, 0, 0], [1, -34, 0, 0]] },
    handR: { keys: [[0, 0, 0, 0], [0.30, 26, 0, 0], [0.52, -22, 0, 0], [1, 0, 0, 0]] },
    upperArmL: { keys: [[0, -54, 0, -22], [0.45, -34, 0, -16], [1, -54, 0, -22]] },
    lowerArmL: { keys: [[0, -30, 0, 0], [0.45, -18, 0, 0], [1, -30, 0, 0]] },
    upperLegL: { keys: [[0, -10, 0, 4], [0.45, -18, 0, 4], [1, -10, 0, 4]] },
    upperLegR: { keys: [[0, 8, 0, -4], [0.45, 14, 0, -4], [1, 8, 0, -4]] },
    lowerLegL: { keys: [[0, 12, 0, 0], [0.45, 22, 0, 0], [1, 12, 0, 0]] },
    lowerLegR: { keys: [[0, 14, 0, 0], [0.45, 8, 0, 0], [1, 14, 0, 0]] },
  }, { loop: false }));

  /* =========================================================
     DYING
     =========================================================
     There were no death clips at all: a zombie that lost its
     last point of health was teleported to the pool at the far
     end of the world in the same frame, so every one of them
     vanished mid-step. Seven ways to go down, chosen by what
     actually killed it.

     ---- HOW A BODY GETS TO THE FLOOR ----
     The rig's hips sit 0.86 m above the sole (0.04 to the hip
     socket, 0.42 thigh, 0.40 shin), so a body lying flat needs
     its pelvis at about the thickness of a pelvis -- call it
     0.18 -- and that is a hips position track of -0.66 or so.
     Rotating without dropping leaves a corpse pivoting in the
     air about its own waist, which is the single most common
     way a death animation goes wrong.

     Which way it goes over is hips.x, and the legs come with
     it because they hang off the hips: at +85 the spine lies
     down the way the body faces and the legs trail behind it,
     which is face down; at -85 the legs go out in front and
     the head goes back, which is flat on its back. Nothing
     needs a separate track to say so.

     None of these loop, and all of them hold their last frame
     -- that frame is the corpse.
     --------------------------------------------------------- */

  /* ---- shot in the body: back, hard, over the heels ---- */
  clips.push(buildClip('zdie_back', 1.42, {
    hips: {
      keys: [[0, 6, 0, 0], [0.12, -6, 3, 4], [0.34, -18, 5, 6], [0.62, -52, 6, 9],
             [0.86, -80, 5, 8], [1, -86, 4, 7]],
      pos: [[0, 0, 0, 0], [0.12, 0, 0.010, -0.02], [0.34, 0, -0.10, -0.10],
            [0.62, 0, -0.34, -0.24], [0.86, 0, -0.60, -0.33], [1, 0, -0.66, -0.35]],
    },
    // The chest opens as it goes: it is falling round the hole.
    spine: { keys: [[0, 16, 0, 0], [0.12, -14, -4, -3], [0.40, -18, -6, -5], [0.8, -6, -4, -4], [1, -2, -3, -4]] },
    chest: { keys: [[0, 9, 0, 0], [0.12, -12, -3, -2], [0.5, -14, -5, -4], [1, -4, -3, -3]] },
    head: { keys: [[0, -10, 0, 0], [0.12, 26, -6, 0], [0.45, 30, -8, 4], [0.8, 8, -12, 10], [1, 2, -16, 14]] },
    // Arms thrown up and out on the hit, then dropped where they land.
    upperArmL: { keys: [[0, -80, 0, -14], [0.14, -128, 0, -48], [0.45, -104, 0, -56],
                        [0.8, -50, 0, -62], [1, -38, 0, -64]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.14, -132, 0, 44], [0.45, -100, 0, 52],
                        [0.8, -46, 0, 58], [1, -34, 0, 60]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.14, -54, 0, 0], [0.6, -24, 0, 0], [1, -12, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [0.14, -58, 0, 0], [0.6, -20, 0, 0], [1, -9, 0, 0]] },
    // The knees fold as it goes over and open again once it is down.
    upperLegL: { keys: [[0, -6, 0, 3], [0.34, 14, 0, 4], [0.62, 26, 0, 6], [1, 6, 0, 8]] },
    upperLegR: { keys: [[0, 4, 0, -3], [0.34, 12, 0, -4], [0.62, 22, 0, -7], [1, 3, 0, -10]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.34, 40, 0, 0], [0.62, 54, 0, 0], [1, 18, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.34, 36, 0, 0], [0.62, 48, 0, 0], [1, 14, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [0.62, -14, 0, 0], [1, -22, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [0.62, -12, 0, 0], [1, -20, 0, 0]] },
  }, { loop: false }));

  /* ---- shot from behind, or simply run out of legs: it goes
         down on its face and does not put a hand out ---- */
  clips.push(buildClip('zdie_face', 1.28, {
    hips: {
      keys: [[0, 8, 0, 0], [0.16, 20, -3, -3], [0.40, 36, -5, -5], [0.68, 62, -6, -7],
             [0.9, 82, -5, -6], [1, 86, -4, -6]],
      pos: [[0, 0, 0, 0], [0.16, 0, -0.03, 0.02], [0.40, 0, -0.14, 0.08],
            [0.68, 0, -0.40, 0.16], [0.9, 0, -0.61, 0.21], [1, 0, -0.66, 0.22]],
    },
    spine: { keys: [[0, 16, 0, 0], [0.40, 26, 4, 3], [0.75, 14, 6, 5], [1, 4, 6, 5]] },
    chest: { keys: [[0, 9, 0, 0], [0.40, 16, 3, 2], [1, 2, 5, 4]] },
    // The head goes first and never comes back up.
    head: { keys: [[0, -10, 0, 0], [0.20, -36, 5, -4], [0.6, -30, 9, -8], [1, -14, 14, -12]] },
    // Arms trail. Nothing catches it -- that is the difference between
    // falling and being dropped.
    upperArmL: { keys: [[0, -80, 0, -14], [0.35, -34, 0, -22], [0.7, -8, 0, -30], [1, 4, 0, -34]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.35, -30, 0, 20], [0.7, -6, 0, 28], [1, 6, 0, 32]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.5, -46, 0, 0], [1, -30, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [0.5, -42, 0, 0], [1, -26, 0, 0]] },
    upperLegL: { keys: [[0, -8, 0, 3], [0.30, -26, 0, 4], [0.68, -12, 0, 6], [1, -4, 0, 7]] },
    upperLegR: { keys: [[0, 6, 0, -3], [0.30, -18, 0, -4], [0.68, -8, 0, -6], [1, -2, 0, -8]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.30, 46, 0, 0], [0.7, 26, 0, 0], [1, 12, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.30, 38, 0, 0], [0.7, 22, 0, 0], [1, 10, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [1, -26, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [1, -24, 0, 0]] },
  }, { loop: false }));

  /* ---- head shot: the strings are cut. No stagger, no reach,
         no wind-up. It stops being held up and it folds. The
         whole thing is over in a second because that is what
         separates it from every other death here. ---- */
  clips.push(buildClip('zdie_head', 1.00, {
    hips: {
      keys: [[0, 6, 0, 0], [0.10, 8, 0, 2], [0.34, 16, 4, 16], [0.62, 30, 8, 42],
             [0.86, 40, 10, 68], [1, 42, 10, 74]],
      // Straight down first, then over sideways: knees, then hip, then
      // shoulder. It collapses rather than falls.
      pos: [[0, 0, 0, 0], [0.10, 0, -0.04, 0], [0.34, 0.03, -0.30, 0.01],
            [0.62, 0.09, -0.52, 0.02], [0.86, 0.15, -0.62, 0.02], [1, 0.17, -0.64, 0.02]],
    },
    spine: { keys: [[0, 16, 0, 0], [0.34, 12, -6, -8], [0.7, 6, -10, -14], [1, 2, -12, -16]] },
    chest: { keys: [[0, 9, 0, 0], [0.34, 6, -4, -5], [1, 0, -8, -10]] },
    // Snapped back by the round, then dead weight on the neck.
    head: { keys: [[0, -10, 0, 0], [0.06, 34, -14, 0], [0.30, 12, -6, 8], [1, -18, 8, 24]] },
    upperArmL: { keys: [[0, -80, 0, -14], [0.30, -46, 0, -20], [1, -6, 0, -26]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.30, -44, 0, 18], [1, -8, 0, 24]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [1, -34, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [1, -30, 0, 0]] },
    // Knees all the way shut -- it went down on them before it went over.
    upperLegL: { keys: [[0, -6, 0, 3], [0.34, -22, 0, 5], [0.7, -34, 0, 9], [1, -36, 0, 11]] },
    upperLegR: { keys: [[0, 4, 0, -3], [0.34, -16, 0, -5], [0.7, -28, 0, -9], [1, -30, 0, -11]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.34, 74, 0, 0], [0.7, 104, 0, 0], [1, 108, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.34, 70, 0, 0], [0.7, 98, 0, 0], [1, 102, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [1, -30, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [1, -28, 0, 0]] },
  }, { loop: false }));

  /* ---- legs shot out: it folds at the knees, kneels for a
         moment, and only then goes over ---- */
  clips.push(buildClip('zdie_knees', 1.36, {
    hips: {
      keys: [[0, 6, 0, 0], [0.22, 14, 0, 3], [0.44, 20, 2, 5], [0.60, 22, 3, 6],
             [0.82, 58, 4, 8], [1, 80, 4, 9]],
      // Down to kneeling and HELD there for a fifth of a second, which is
      // the whole point of this one, then over onto the face.
      pos: [[0, 0, 0, 0], [0.22, 0, -0.22, 0.02], [0.44, 0, -0.40, 0.03],
            [0.60, 0, -0.41, 0.03], [0.82, 0, -0.58, 0.13], [1, 0, -0.66, 0.19]],
    },
    spine: { keys: [[0, 16, 0, 0], [0.44, 24, -3, -2], [0.60, 20, -3, -2], [1, 6, -5, -4]] },
    chest: { keys: [[0, 9, 0, 0], [0.44, 14, -2, -1], [1, 3, -4, -3]] },
    head: { keys: [[0, -10, 0, 0], [0.30, -28, 4, -3], [0.60, -22, 6, -5], [1, -12, 10, -9]] },
    // Hands reach for the floor on the way down and take none of the weight.
    upperArmL: { keys: [[0, -80, 0, -14], [0.44, -56, 0, -26], [0.75, -18, 0, -30], [1, 2, 0, -32]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.44, -52, 0, 24], [0.75, -16, 0, 28], [1, 4, 0, 30]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.44, -62, 0, 0], [1, -26, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [0.44, -58, 0, 0], [1, -24, 0, 0]] },
    upperLegL: { keys: [[0, -6, 0, 3], [0.44, -30, 0, 5], [0.60, -32, 0, 5], [1, -10, 0, 7]] },
    upperLegR: { keys: [[0, 4, 0, -3], [0.44, -26, 0, -5], [0.60, -28, 0, -5], [1, -8, 0, -7]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.44, 96, 0, 0], [0.60, 98, 0, 0], [1, 62, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.44, 92, 0, 0], [0.60, 94, 0, 0], [1, 58, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [0.44, -34, 0, 0], [1, -30, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [0.44, -32, 0, 0], [1, -28, 0, 0]] },
  }, { loop: false }));

  /* ---- burning: the only one that takes its time. It beats at
         itself, doubles over, and ends curled on its side with
         the knees drawn up, which is what fire does to a body ---- */
  clips.push(buildClip('zdie_burn', 2.10, {
    hips: {
      keys: [[0, 6, 0, 0], [0.14, 2, -12, -6], [0.28, 10, 14, 7], [0.44, 4, -16, -8],
             [0.62, 26, 8, 22], [0.82, 52, 6, 54], [1, 62, 5, 68]],
      pos: [[0, 0, 0, 0], [0.28, 0, 0.02, 0], [0.44, 0, -0.06, 0], [0.62, 0.04, -0.30, 0.04],
            [0.82, 0.12, -0.55, 0.06], [1, 0.16, -0.62, 0.06]],
    },
    spine: { keys: [[0, 16, 0, 0], [0.14, 30, 10, 6], [0.30, 22, -12, -7], [0.5, 38, 8, 5],
                    [0.75, 30, -6, -8], [1, 22, -8, -12]] },
    chest: { keys: [[0, 9, 0, 0], [0.20, 20, 8, 4], [0.5, 24, -8, -5], [1, 16, -6, -8]] },
    head: { keys: [[0, -10, 0, 0], [0.12, 22, -18, 0], [0.26, -30, 20, 6], [0.46, 18, -16, -5],
                   [0.7, -24, 8, 10], [1, -34, 6, 16]] },
    // Beating at itself, then folded in over the chest.
    upperArmL: { keys: [[0, -80, 0, -14], [0.12, -134, 0, 26], [0.26, -96, 0, 40],
                        [0.44, -128, 0, 20], [0.7, -92, 0, 44], [1, -84, 0, 50]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.16, -130, 0, -22], [0.32, -92, 0, -38],
                        [0.5, -126, 0, -18], [0.7, -88, 0, -42], [1, -80, 0, -48]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.12, -118, 0, 0], [0.44, -104, 0, 0], [1, -122, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [0.16, -114, 0, 0], [0.5, -100, 0, 0], [1, -118, 0, 0]] },
    // Knees drawn right up at the end.
    upperLegL: { keys: [[0, -6, 0, 3], [0.3, -18, 0, 4], [0.62, -44, 0, 8], [1, -68, 0, 12]] },
    upperLegR: { keys: [[0, 4, 0, -3], [0.3, 10, 0, -4], [0.62, -38, 0, -8], [1, -60, 0, -12]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.3, 34, 0, 0], [0.62, 76, 0, 0], [1, 104, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.3, 28, 0, 0], [0.62, 70, 0, 0], [1, 98, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [1, -34, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [1, -32, 0, 0]] },
  }, { loop: false }));

  /* ---- the current: everything locks straight, it arches, and
         it goes over in one piece like a felled post. The
         opposite of every other death here, which is why it is
         worth having ---- */
  clips.push(buildClip('zdie_shock', 1.16, {
    hips: {
      keys: [[0, 6, 0, 0], [0.14, -16, 0, 0], [0.30, -22, 0, 0], [0.52, -44, 0, 3],
             [0.80, -76, 0, 5], [1, -88, 0, 6]],
      pos: [[0, 0, 0, 0], [0.14, 0, 0.03, -0.02], [0.30, 0, 0.02, -0.05],
            [0.52, 0, -0.26, -0.20], [0.80, 0, -0.58, -0.32], [1, 0, -0.66, -0.36]],
    },
    // Arched hard backward and rigid the whole way down.
    spine: { keys: [[0, 16, 0, 0], [0.14, -24, 0, 0], [0.40, -28, 0, 0], [1, -20, 0, 0]] },
    chest: { keys: [[0, 9, 0, 0], [0.14, -18, 0, 0], [1, -14, 0, 0]] },
    head: { keys: [[0, -10, 0, 0], [0.14, 40, 0, 0], [0.5, 44, 0, 0], [1, 30, 0, 0]] },
    // Arms out straight and locked: the elbows never bend again.
    upperArmL: { keys: [[0, -80, 0, -14], [0.16, -96, 0, -74], [0.5, -92, 0, -80], [1, -84, 0, -82]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.16, -98, 0, 72], [0.5, -94, 0, 78], [1, -86, 0, 80]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.16, -2, 0, 0], [1, 0, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [0.16, -2, 0, 0], [1, 0, 0, 0]] },
    upperLegL: { keys: [[0, -6, 0, 3], [0.16, -2, 0, 5], [1, 2, 0, 6]] },
    upperLegR: { keys: [[0, 4, 0, -3], [0.16, 0, 0, -5], [1, 1, 0, -6]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.16, 0, 0, 0], [1, 0, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.16, 0, 0, 0], [1, 0, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [0.16, -14, 0, 0], [1, -18, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [0.16, -14, 0, 0], [1, -18, 0, 0]] },
  }, { loop: false }));

  /* ---- blown off its feet. Fast, and it lands wrong: nothing
         about this one is symmetrical ---- */
  clips.push(buildClip('zdie_blast', 0.92, {
    hips: {
      keys: [[0, 6, 0, 0], [0.16, -40, 26, -22], [0.44, -66, 40, -40], [0.74, -82, 34, -30],
             [1, -84, 30, -26]],
      pos: [[0, 0, 0, 0], [0.16, -0.06, 0.16, -0.16], [0.44, -0.13, -0.05, -0.42],
            [0.74, -0.16, -0.56, -0.60], [1, -0.17, -0.66, -0.62]],
    },
    spine: { keys: [[0, 16, 0, 0], [0.16, -20, -18, 14], [0.5, -14, -24, 18], [1, -6, -20, 16]] },
    chest: { keys: [[0, 9, 0, 0], [0.16, -16, -12, 10], [1, -4, -16, 12]] },
    head: { keys: [[0, -10, 0, 0], [0.16, 34, -22, -12], [0.5, 26, -30, -16], [1, 6, -34, -22]] },
    upperArmL: { keys: [[0, -80, 0, -14], [0.16, -142, 0, -66], [0.5, -110, 0, -80], [1, -44, 0, -86]] },
    upperArmR: { keys: [[0, -84, 0, 14], [0.16, -120, 0, 30], [0.5, -86, 0, 22], [1, -20, 0, 18]] },
    lowerArmL: { keys: [[0, -20, 0, 0], [0.16, -70, 0, 0], [1, -14, 0, 0]] },
    lowerArmR: { keys: [[0, -24, 0, 0], [0.16, -34, 0, 0], [1, -52, 0, 0]] },
    upperLegL: { keys: [[0, -6, 0, 3], [0.16, 34, 0, 14], [0.5, 30, 0, 20], [1, 12, 0, 24]] },
    upperLegR: { keys: [[0, 4, 0, -3], [0.16, 18, 0, -6], [0.5, 8, 0, -3], [1, -6, 0, -2]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.16, 62, 0, 0], [1, 34, 0, 0]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.16, 30, 0, 0], [1, 8, 0, 0]] },
    footL: { keys: [[0, 6, 0, 0], [1, -28, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [1, -16, 0, 0]] },
  }, { loop: false }));

  /* =========================================================
     GAITS, ONE PER KIND
     =========================================================
     The four kinds moved on three clips between them, so a
     thrower and a walker were the same silhouette at different
     speeds -- and the thing a player reads at twenty metres in
     a dark room is the silhouette, not the speed. Each kind now
     has a walk that says what it is before it is close enough
     to shoot.

     Ground rule for all of them: the pelvis has to have a
     position track. Rotations alone nail it to one height and
     the figure glides, and every one of these is about weight.
     --------------------------------------------------------- */

  /* ---------------------------------------------------------
     BURDENED — the walker, carrying something that is not
     there. Deep stoop, head hung below the shoulder line,
     arms swinging dead and slightly BEHIND the body the way
     they do under a pack, and a short scuffing stride: the
     feet barely clear the floor because lifting them is work.
     The bob is heavy and lands hard.
     --------------------------------------------------------- */
  clips.push(buildClip('zwalk_burden', 1.92, {
    hips: {
      keys: [[0, 12, -6, 5], [0.25, 11, 0, -2], [0.5, 12, 6, -5], [0.75, 11, 0, 2], [1, 12, -6, 5]],
      // Deeper than the plain shamble, and it drops faster than it rises:
      // weight arriving, not weight being carried.
      pos: [[0, 0.020, -0.028, 0], [0.18, 0.026, -0.006, 0], [0.32, 0.024, 0.012, 0],
            [0.5, -0.020, -0.030, 0], [0.68, -0.026, -0.006, 0], [0.82, -0.024, 0.010, 0],
            [1, 0.020, -0.028, 0]],
    },
    // The stoop is in the spine, not the hips, so the pelvis stays under
    // the load and the back does the bending -- which is what a person
    // under a pack actually looks like.
    spine: { keys: [[0, 30, 5, -3], [0.25, 33, 0, 1], [0.5, 30, -5, 3], [0.75, 33, 0, -1], [1, 30, 5, -3]] },
    chest: { keys: [[0, 20, 4, -2], [0.5, 23, -4, 2], [1, 20, 4, -2]] },
    // Head hangs below the shoulders and swings loose on the neck.
    head: { keys: [[0, -6, 7, -8], [0.3, -2, 1, -12], [0.6, -10, -6, -4], [1, -6, 7, -8]] },

    // Arms hang and trail. Positive z on the shoulder pushes them out from
    // the ribs so they do not saw through the coat.
    upperArmL: { keys: [[0, -14, 4, -13], [0.5, -30, -3, -10], [1, -14, 4, -13]] },
    upperArmR: { keys: [[0, -30, -4, 13], [0.5, -14, 3, 10], [1, -30, -4, 13]] },
    lowerArmL: { keys: [[0, -22, 0, 0], [0.5, -12, 0, 0], [1, -22, 0, 0]] },
    lowerArmR: { keys: [[0, -12, 0, 0], [0.5, -22, 0, 0], [1, -12, 0, 0]] },

    // Short steps. The knee never straightens and the foot scuffs through.
    upperLegL: { keys: [[0, -17, 0, 2], [0.22, -6, 0, 2], [0.42, 10, 0, 2], [0.58, 8, 0, 2],
                        [0.78, -6, 0, 2], [1, -17, 0, 2]] },
    lowerLegL: { keys: [[0, 10, 0, 0], [0.30, 12, 0, 0], [0.50, 26, 0, 0], [0.68, 34, 0, 0],
                        [0.86, 14, 0, 0], [1, 10, 0, 0]] },
    footL: { keys: [[0, 4, 0, 0], [0.30, -8, 0, 0], [0.62, 2, 0, 0], [1, 4, 0, 0]] },
    upperLegR: { keys: [[0, 9, 0, -3], [0.22, -6, 0, -3], [0.5, -17, 0, -3], [0.72, -6, 0, -3],
                        [0.92, 8, 0, -3], [1, 9, 0, -3]] },
    lowerLegR: { keys: [[0, 26, 0, 0], [0.18, 34, 0, 0], [0.36, 14, 0, 0], [0.56, 10, 0, 0],
                        [0.80, 12, 0, 0], [1, 26, 0, 0]] },
    footR: { keys: [[0, 2, 0, 0], [0.20, 4, 0, 0], [0.80, -8, 0, 0], [1, 2, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     LIMP — the thrower. One leg does not work at all: the knee
     is locked, the toe is down, and the foot is dragged round
     rather than swung. Everything else is the body getting over
     that leg and off it again as fast as it can, which is a
     lurch. The slowest thing in the game and it should look it.
     --------------------------------------------------------- */
  clips.push(buildClip('zlimp', 2.35, {
    hips: {
      /* The list is the point. It hangs 13 degrees over the bad
         side through the whole of that leg's stance and only
         comes back while the good leg is carrying it. */
      keys: [[0, 9, -4, 15], [0.20, 8, -2, 13], [0.45, 9, 3, 2], [0.70, 10, 5, -4],
             [0.88, 9, 0, 8], [1, 9, -4, 15]],
      /* Down hard onto the good leg, dragged along flat on the
         bad one -- one deep dip a cycle instead of two, which is
         what makes a limp read as a limp. */
      pos: [[0, 0.034, -0.042, 0], [0.20, 0.030, -0.030, 0], [0.45, 0.004, 0.016, 0],
            [0.70, -0.026, 0.006, 0], [0.88, 0.010, -0.020, 0], [1, 0.034, -0.042, 0]],
    },
    spine: { keys: [[0, 22, 6, -11], [0.45, 26, -4, -2], [0.70, 24, -6, 3], [1, 22, 6, -11]] },
    chest: { keys: [[0, 13, 5, -8], [0.45, 16, -3, -1], [1, 13, 5, -8]] },
    head: { keys: [[0, -12, 9, -14], [0.3, -8, 3, -16], [0.62, -15, -6, -6], [1, -12, 9, -14]] },
    // The near arm is half out for balance; it grabs at nothing on the lurch.
    upperArmL: { keys: [[0, -58, 6, -22], [0.22, -70, 2, -28], [0.60, -46, 8, -16], [1, -58, 6, -22]] },
    upperArmR: { keys: [[0, -40, -5, 20], [0.45, -52, 2, 26], [1, -40, -5, 20]] },
    lowerArmL: { keys: [[0, -30, 0, 0], [0.22, -46, 0, 0], [0.60, -18, 0, 0], [1, -30, 0, 0]] },
    lowerArmR: { keys: [[0, -22, 0, 0], [0.45, -34, 0, 0], [1, -22, 0, 0]] },

    /* Good leg: a real step, and it hurries -- most of the cycle
       is spent getting the body forward before the bad leg has
       to take any of it. */
    upperLegL: { keys: [[0, -30, 0, 3], [0.14, -12, 0, 3], [0.30, 8, 0, 3], [0.42, 20, 0, 3],
                        [0.60, -4, 0, 3], [0.80, -26, 0, 3], [1, -30, 0, 3]] },
    lowerLegL: { keys: [[0, 5, 0, 0], [0.14, 3, 0, 0], [0.34, 14, 0, 0], [0.50, 62, 0, 0],
                        [0.72, 26, 0, 0], [0.90, 6, 0, 0], [1, 5, 0, 0]] },
    footL: { keys: [[0, 9, 0, 0], [0.22, -4, 0, 0], [0.44, -26, 0, 0], [0.62, 12, 0, 0], [1, 9, 0, 0]] },

    /* Bad leg: it never leaves the floor and the knee never
       moves. Eight degrees of hip swing, dragged round by the
       pelvis, with the toe pointed down the whole way -- so it
       scrapes rather than steps. */
    upperLegR: { keys: [[0, 6, 0, -8], [0.30, 2, 0, -8], [0.55, -8, 0, -8], [0.80, -2, 0, -8], [1, 6, 0, -8]] },
    lowerLegR: { keys: [[0, 15, 0, 0], [0.5, 17, 0, 0], [1, 15, 0, 0]] },
    footR: { keys: [[0, -20, 0, 0], [0.5, -24, 0, 0], [1, -20, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     RUNNER — a person, until you look at the arm. It moves the
     way somebody moves who is still using their legs properly:
     upright, a real stride, weight over the feet. The wrong is
     all above the waist -- one arm is clutched hard across the
     chest and never swings, and every third or fourth step it
     scuffs and has to catch itself.

     That clutched arm is not decoration. It is the one that
     comes off the body and swings when it reaches you, and a
     player who has watched it held for twenty metres reads the
     wind-up before the swing lands.
     --------------------------------------------------------- */
  clips.push(buildClip('zrun_hold', 0.74, {
    hips: {
      keys: [[0, 6, -13, 3], [0.25, 5, 0, -1], [0.5, 6, 13, -3], [0.75, 5, 0, 1], [1, 6, -13, 3]],
      pos: [[0, 0.012, -0.030, 0], [0.25, 0.016, 0.026, 0], [0.5, -0.012, -0.032, 0],
            [0.75, -0.016, 0.024, 0], [1, 0.012, -0.030, 0]],
    },
    spine: { keys: [[0, 15, 11, -4], [0.5, 15, -11, 4], [1, 15, 11, -4]] },
    chest: { keys: [[0, 9, 9, -3], [0.5, 9, -9, 3], [1, 9, 9, -3]] },
    // Head up and looking at you, which is the other thing that separates
    // it from the rest of them.
    head: { keys: [[0, -4, -8, 2], [0.3, -6, -3, -3], [0.6, -3, -10, 4], [1, -4, -8, 2]] },

    /* Left arm: clutched ACROSS the ribs, gripped, dead still bar the
       shudder the stride puts through it.
       Shoulder z is signed per side and it is easy to get backwards: on
       the LEFT arm, negative z brings it across the body and positive z
       pushes it away from the ribs (the idle hangs at -18). Written +42
       first time, which held the arm out to the side like a man hailing
       a bus. */
    upperArmL: { keys: [[0, -58, 0, -50], [0.5, -62, 0, -54], [1, -58, 0, -50]] },
    lowerArmL: { keys: [[0, -110, 0, 0], [0.5, -114, 0, 0], [1, -110, 0, 0]] },
    handL: { keys: [[0, 16, 0, 0], [0.5, 12, 0, 0], [1, 16, 0, 0]] },
    // Right arm: a runner's swing, elbow at ninety.
    upperArmR: { keys: [[0, -46, 0, 12], [0.25, 14, 0, 10], [0.5, -52, 0, 12], [0.75, 18, 0, 10], [1, -46, 0, 12]] },
    lowerArmR: { keys: [[0, -84, 0, 0], [0.25, -62, 0, 0], [0.5, -88, 0, 0], [0.75, -60, 0, 0], [1, -84, 0, 0]] },

    // A real stride, both sides, with the knees driving through.
    upperLegL: { keys: [[0, -40, 0, 2], [0.16, -16, 0, 2], [0.34, 14, 0, 2], [0.46, 30, 0, 2],
                        [0.66, -8, 0, 2], [0.86, -36, 0, 2], [1, -40, 0, 2]] },
    lowerLegL: { keys: [[0, 12, 0, 0], [0.16, 4, 0, 0], [0.36, 22, 0, 0], [0.52, 84, 0, 0],
                        [0.72, 40, 0, 0], [0.90, 14, 0, 0], [1, 12, 0, 0]] },
    footL: { keys: [[0, 12, 0, 0], [0.22, -6, 0, 0], [0.46, -28, 0, 0], [0.64, 14, 0, 0], [1, 12, 0, 0]] },
    upperLegR: { keys: [[0, 14, 0, -2], [0.16, -8, 0, -2], [0.36, -36, 0, -2], [0.5, -40, 0, -2],
                        [0.66, -16, 0, -2], [0.84, 30, 0, -2], [1, 14, 0, -2]] },
    lowerLegR: { keys: [[0, 40, 0, 0], [0.10, 22, 0, 0], [0.30, 12, 0, 0], [0.52, 14, 0, 0],
                        [0.70, 84, 0, 0], [0.88, 40, 0, 0], [1, 40, 0, 0]] },
    footR: { keys: [[0, -28, 0, 0], [0.16, 14, 0, 0], [0.5, 12, 0, 0], [0.74, -6, 0, 0], [1, -28, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     THE SWING — the held arm comes off the chest and goes round
     in one flat horizontal arc. Not a punch: a whole-body
     rotation with an arm on the end of it, which is why the
     hips lead and the arm arrives late.
     --------------------------------------------------------- */
  clips.push(buildClip('zattack_swing', 0.78, {
    hips: {
      keys: [[0, 5, -34, 0], [0.30, 4, -46, 0], [0.58, 6, 40, 0], [1, 5, -34, 0]],
      pos: [[0, 0, 0, 0], [0.30, 0.02, 0.010, -0.020], [0.58, -0.02, -0.010, 0.030], [1, 0, 0, 0]],
    },
    spine: { keys: [[0, 14, -26, 0], [0.30, 12, -40, 0], [0.58, 16, 38, 0], [1, 14, -26, 0]] },
    chest: { keys: [[0, 8, -20, 0], [0.30, 7, -34, 0], [0.58, 10, 32, 0], [1, 8, -20, 0]] },
    head: { keys: [[0, -6, -14, 0], [0.30, -4, -26, 0], [0.62, -8, 26, 0], [1, -6, -14, 0]] },
    /* Held across the chest, wound a little further across, then thrown
       all the way round and out. The shoulder sweeps 140 degrees of z
       -- from -66 (hand at the far shoulder) to +74 (arm out past the
       target) -- while the elbow opens from -114 to -12 in a fifth of a
       second, and that is where the speed comes from. */
    upperArmL: { keys: [[0, -58, 0, -50], [0.28, -62, 0, -66], [0.46, -80, 0, 8],
                        [0.58, -84, 0, 62], [0.70, -78, 0, 74], [0.86, -66, 0, 6],
                        [1, -58, 0, -50]] },
    lowerArmL: { keys: [[0, -110, 0, 0], [0.28, -104, 0, 0], [0.48, -12, 0, 0],
                        [0.66, -20, 0, 0], [0.86, -70, 0, 0], [1, -110, 0, 0]] },
    handL: { keys: [[0, 16, 0, 0], [0.44, -18, 0, 0], [0.66, 10, 0, 0], [1, 16, 0, 0]] },
    upperArmR: { keys: [[0, -46, 0, 12], [0.30, -20, 0, 26], [0.58, -66, 0, 8], [1, -46, 0, 12]] },
    lowerArmR: { keys: [[0, -84, 0, 0], [0.30, -60, 0, 0], [0.58, -92, 0, 0], [1, -84, 0, 0]] },
    upperLegL: { keys: [[0, -8, 0, 3], [0.30, -18, 0, 3], [0.58, 10, 0, 3], [1, -8, 0, 3]] },
    upperLegR: { keys: [[0, 8, 0, -3], [0.30, 16, 0, -3], [0.58, -14, 0, -3], [1, 8, 0, -3]] },
    lowerLegL: { keys: [[0, 12, 0, 0], [0.30, 26, 0, 0], [0.58, 8, 0, 0], [1, 12, 0, 0]] },
    lowerLegR: { keys: [[0, 14, 0, 0], [0.30, 6, 0, 0], [0.58, 24, 0, 0], [1, 14, 0, 0]] },
  }, { loop: false }));

  /* ---------------------------------------------------------
     IDLE — standing, but never still. It sways over its feet,
     breathes at the shoulders and the hands drift.
     --------------------------------------------------------- */
  clips.push(buildClip('zidle', 4.2, {
    hips: {
      keys: [[0, 5, -3, 3], [0.33, 5, 2, -1], [0.66, 5, -1, -3], [1, 5, -3, 3]],
      // Weight rocking slowly from one foot to the other.
      pos: [[0, 0.012, -0.004, 0], [0.33, -0.010, 0.002, 0], [0.66, 0.006, -0.006, 0], [1, 0.012, -0.004, 0]],
    },
    spine: { keys: [[0, 15, -3, 2], [0.5, 17, 3, -2], [1, 15, -3, 2]] },
    chest: { keys: [[0, 8, 2, -1], [0.5, 10, -2, 1], [1, 8, 2, -1]] },
    head: { keys: [[0, -10, 6, -9], [0.35, -14, -2, -11], [0.7, -8, -6, -5], [1, -10, 6, -9]] },
    upperArmL: { keys: [[0, -100, 6, -18], [0.33, -92, -4, -25], [0.66, -106, 8, -14], [1, -100, 6, -18]] },
    upperArmR: { keys: [[0, -104, -7, 17], [0.33, -96, 5, 23], [0.66, -91, -6, 13], [1, -104, -7, 17]] },
    lowerArmL: { keys: [[0, -16, 0, 0], [0.5, -28, 0, 0], [1, -16, 0, 0]] },
    lowerArmR: { keys: [[0, -26, 0, 0], [0.5, -12, 0, 0], [1, -26, 0, 0]] },
    handL: { keys: [[0, 12, 0, -8], [0.5, -7, 0, 7], [1, 12, 0, -8]] },
    handR: { keys: [[0, -8, 0, 7], [0.5, 14, 0, -8], [1, -8, 0, 7]] },
    upperLegL: { keys: [[0, -5, 0, 3], [0.5, -8, 0, 3], [1, -5, 0, 3]] },
    upperLegR: { keys: [[0, 4, 0, -4], [0.5, 2, 0, -4], [1, 4, 0, -4]] },
    lowerLegL: { keys: [[0, 8, 0, 0], [0.5, 12, 0, 0], [1, 8, 0, 0]] },
    lowerLegR: { keys: [[0, 11, 0, 0], [0.5, 7, 0, 0], [1, 11, 0, 0]] },
  }));

  /* ---------------------------------------------------------
     STANDING — a person who is alive.

     Every one of the ten playable characters is built by the zombie
     builder, which is right for the geometry and wrong for the pose:
     they were all posed on `zidle`, whose shoulders sit at -100 degrees.
     That is the arms-out shamble, and it is what the whole cast has been
     doing on the character-select stage -- ten survivors standing in
     front of you with their hands up at their faces like the things they
     are about to fight.

     Arms down. Weight on one hip, shifting slowly; the chest rises and
     falls; the head turns a few degrees and comes back. Alive, but not
     doing anything.
     --------------------------------------------------------- */
  clips.push(buildClip('zstand', 6.4, {
    hips: {
      keys: [[0, 0, -2, 2], [0.35, 0, 2, -2], [0.7, 0, 1, -1], [1, 0, -2, 2]],
      pos: [[0, 0.008, 0, 0], [0.35, -0.008, 0.002, 0], [0.7, 0.004, -0.001, 0], [1, 0.008, 0, 0]],
    },
    // Upright. The zombie spine carries a 15-degree stoop; a survivor does not.
    spine: { keys: [[0, 1, -1, 1], [0.5, 3, 1, -1], [1, 1, -1, 1]] },
    chest: { keys: [[0, -1, 1, 0], [0.5, 2, -1, 0], [1, -1, 1, 0]] },
    head: { keys: [[0, 0, 5, -1], [0.3, -2, -4, 1], [0.62, 1, 8, -2], [1, 0, 5, -1]] },
    /* Hanging, with the small outward carry a real arm has -- the elbows
       stand a few degrees off the ribs rather than being welded to them. */
    upperArmL: { keys: [[0, -4, 2, -7], [0.35, -1, -1, -9], [0.7, -6, 3, -6], [1, -4, 2, -7]] },
    upperArmR: { keys: [[0, -6, -2, 7], [0.35, -2, 1, 9], [0.7, -3, -3, 6], [1, -6, -2, 7]] },
    lowerArmL: { keys: [[0, -10, 0, 0], [0.5, -15, 0, 0], [1, -10, 0, 0]] },
    lowerArmR: { keys: [[0, -13, 0, 0], [0.5, -8, 0, 0], [1, -13, 0, 0]] },
    handL: { keys: [[0, 4, 0, -3], [0.5, -2, 0, 2], [1, 4, 0, -3]] },
    handR: { keys: [[0, -3, 0, 2], [0.5, 5, 0, -3], [1, -3, 0, 2]] },
    // Weight on the left, knees soft, one foot a little forward.
    upperLegL: { keys: [[0, -2, 0, 2], [0.5, -4, 0, 2], [1, -2, 0, 2]] },
    upperLegR: { keys: [[0, 3, 0, -3], [0.5, 1, 0, -3], [1, 3, 0, -3]] },
    lowerLegL: { keys: [[0, 3, 0, 0], [0.5, 5, 0, 0], [1, 3, 0, 0]] },
    lowerLegR: { keys: [[0, 5, 0, 0], [0.5, 3, 0, 0], [1, 5, 0, 0]] },
  }));

  return clips;
}
