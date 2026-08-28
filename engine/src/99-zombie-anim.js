/* ============================================================
   ZOMBIE ANIMATION — clips for the dead.

   The human walk cycle is symmetric, balanced and efficient,
   which is exactly what a corpse is not. Everything here breaks
   one of those three on purpose:

     asymmetry  one leg drives, the other drags. The single
                strongest cue that something is wrong with a
                walk, and it costs nothing but different keys
                on the left and right tracks.
     imbalance  the head leads the hips. A living walker keeps
                its head over its centre of mass; a shambler
                falls forwards and catches itself, forever.
     slack      arms hang and swing from the shoulder with no
                elbow control, lagging the body instead of
                counter-swinging with it.

   Keys are [normalisedTime, xDeg, yDeg, zDeg].
   ============================================================ */

function makeZombieClips() {
  const clips = [];

  /* ---- shamble: the default walk ---- */
  clips.push(buildClip('zwalk', 1.85, {
    // Hips roll heavily and drop on the dragging side.
    hips: { keys: [[0, 4, -3, 5], [0.25, 4, 0, -2], [0.5, 4, 3, -6], [0.75, 4, 0, 1], [1, 4, -3, 5]] },
    spine: { keys: [[0, 15, 2, 3], [0.5, 17, -2, -3], [1, 15, 2, 3]] },
    chest: { keys: [[0, 10, -3, -2], [0.5, 12, 3, 2], [1, 10, -3, -2]] },
    // Head lolls, and never quite comes back to level.
    head: { keys: [[0, -8, 7, -9], [0.3, -11, 2, -12], [0.6, -7, -6, -6], [1, -8, 7, -9]] },

    // Left leg drives: a full stride with a real knee bend.
    upperLegL: { keys: [[0, 30, 0, 2], [0.5, -20, 0, 2], [1, 30, 0, 2]] },
    lowerLegL: { keys: [[0, -8, 0, 0], [0.3, -6, 0, 0], [0.62, 46, 0, 0], [1, -8, 0, 0]] },
    footL: { keys: [[0, -14, 0, 0], [0.5, 10, 0, 0], [1, -14, 0, 0]] },

    // Right leg drags: barely lifts, knee stays locked, toe scrapes.
    upperLegR: { keys: [[0, -12, 0, -4], [0.5, 14, 0, -4], [1, -12, 0, -4]] },
    lowerLegR: { keys: [[0, 12, 0, 0], [0.5, 6, 0, 0], [1, 12, 0, 0]] },
    footR: { keys: [[0, 16, 0, 0], [0.5, 14, 0, 0], [1, 16, 0, 0]] },

    // Arms hang and trail. They swing late, and one is held higher than
    // the other because nothing is correcting it.
    upperArmL: { keys: [[0, -18, 0, -14], [0.5, 10, 0, -12], [1, -18, 0, -14]] },
    upperArmR: { keys: [[0, 14, 0, 20], [0.5, -12, 0, 24], [1, 14, 0, 20]] },
    lowerArmL: { keys: [[0, 34, 0, 0], [0.5, 26, 0, 0], [1, 34, 0, 0]] },
    lowerArmR: { keys: [[0, 58, 0, 0], [0.5, 66, 0, 0], [1, 58, 0, 0]] },
  }));

  /* ---- heavy shamble: wide stance, weight thrown side to side ---- */
  clips.push(buildClip('zwalk_heavy', 2.25, {
    hips: { keys: [[0, 3, -5, 9], [0.25, 3, 0, -3], [0.5, 3, 5, -10], [0.75, 3, 0, 2], [1, 3, -5, 9]] },
    spine: { keys: [[0, 11, 4, 5], [0.5, 13, -4, -5], [1, 11, 4, 5]] },
    chest: { keys: [[0, 7, -5, -4], [0.5, 9, 5, 4], [1, 7, -5, -4]] },
    head: { keys: [[0, -6, 8, -7], [0.5, -8, -8, 4], [1, -6, 8, -7]] },
    // Legs swing wide and low: the feet barely clear the floor.
    upperLegL: { keys: [[0, 20, 0, 9], [0.5, -13, 0, 11], [1, 20, 0, 9]] },
    lowerLegL: { keys: [[0, -4, 0, 0], [0.62, 30, 0, 0], [1, -4, 0, 0]] },
    upperLegR: { keys: [[0, -13, 0, -11], [0.5, 20, 0, -9], [1, -13, 0, -11]] },
    lowerLegR: { keys: [[0, 30, 0, 0], [0.12, 4, 0, 0], [0.5, -4, 0, 0], [1, 30, 0, 0]] },
    footL: { keys: [[0, -8, 0, 0], [0.5, 6, 0, 0], [1, -8, 0, 0]] },
    footR: { keys: [[0, 6, 0, 0], [0.5, -8, 0, 0], [1, 6, 0, 0]] },
    // Arms pushed out by the trunk, hanging well clear of the body.
    upperArmL: { keys: [[0, -12, 0, -30], [0.5, 8, 0, -28], [1, -12, 0, -30]] },
    upperArmR: { keys: [[0, 10, 0, 32], [0.5, -10, 0, 34], [1, 10, 0, 32]] },
    lowerArmL: { keys: [[0, 30, 0, 0], [0.5, 24, 0, 0], [1, 30, 0, 0]] },
    lowerArmR: { keys: [[0, 52, 0, 0], [0.5, 58, 0, 0], [1, 52, 0, 0]] },
  }));

  /* ---- light shamble: narrower track, more hip, quicker ---- */
  clips.push(buildClip('zwalk_light', 1.55, {
    hips: { keys: [[0, 4, -2, 8], [0.25, 4, 0, -2], [0.5, 4, 2, -9], [0.75, 4, 0, 1], [1, 4, -2, 8]] },
    spine: { keys: [[0, 17, 3, 2], [0.5, 19, -3, -2], [1, 17, 3, 2]] },
    chest: { keys: [[0, 11, -4, -1], [0.5, 13, 4, 1], [1, 11, -4, -1]] },
    head: { keys: [[0, -10, 9, -12], [0.35, -13, 3, -14], [0.7, -8, -7, -8], [1, -10, 9, -12]] },
    upperLegL: { keys: [[0, 33, 0, -2], [0.5, -23, 0, -2], [1, 33, 0, -2]] },
    lowerLegL: { keys: [[0, -9, 0, 0], [0.3, -6, 0, 0], [0.62, 50, 0, 0], [1, -9, 0, 0]] },
    upperLegR: { keys: [[0, -15, 0, 2], [0.5, 17, 0, 2], [1, -15, 0, 2]] },
    lowerLegR: { keys: [[0, 16, 0, 0], [0.5, 8, 0, 0], [1, 16, 0, 0]] },
    footL: { keys: [[0, -15, 0, 0], [0.5, 11, 0, 0], [1, -15, 0, 0]] },
    footR: { keys: [[0, 18, 0, 0], [0.5, 15, 0, 0], [1, 18, 0, 0]] },
    upperArmL: { keys: [[0, -22, 0, -10], [0.5, 13, 0, -9], [1, -22, 0, -10]] },
    upperArmR: { keys: [[0, 17, 0, 15], [0.5, -14, 0, 18], [1, 17, 0, 15]] },
    lowerArmL: { keys: [[0, 38, 0, 0], [0.5, 30, 0, 0], [1, 38, 0, 0]] },
    lowerArmR: { keys: [[0, 62, 0, 0], [0.5, 70, 0, 0], [1, 62, 0, 0]] },
  }));

  /* ---- sprint: the ones that run ---- */
  clips.push(buildClip('zrun', 0.72, {
    hips: { keys: [[0, 12, -4, 4], [0.25, 12, 0, 0], [0.5, 12, 4, -4], [0.75, 12, 0, 0], [1, 12, -4, 4]] },
    spine: { keys: [[0, 26, 3, 0], [0.5, 28, -3, 0], [1, 26, 3, 0]] },
    chest: { keys: [[0, 12, -4, 0], [0.5, 14, 4, 0], [1, 12, -4, 0]] },
    // Head thrust forward ahead of the body — running at you, not with you.
    head: { keys: [[0, -26, 4, -4], [0.5, -28, -4, 4], [1, -26, 4, -4]] },
    upperLegL: { keys: [[0, 52, 0, 0], [0.5, -34, 0, 0], [1, 52, 0, 0]] },
    lowerLegL: { keys: [[0, -16, 0, 0], [0.28, -8, 0, 0], [0.58, 78, 0, 0], [1, -16, 0, 0]] },
    footL: { keys: [[0, -18, 0, 0], [0.5, 16, 0, 0], [1, -18, 0, 0]] },
    upperLegR: { keys: [[0, -34, 0, 0], [0.5, 52, 0, 0], [1, -34, 0, 0]] },
    lowerLegR: { keys: [[0, 78, 0, 0], [0.08, 10, 0, 0], [0.5, -16, 0, 0], [1, 78, 0, 0]] },
    footR: { keys: [[0, 16, 0, 0], [0.5, -18, 0, 0], [1, 16, 0, 0]] },
    // Arms reach rather than pump: hands up and forward, grasping.
    upperArmL: { keys: [[0, -62, 0, -26], [0.5, -74, 0, -22], [1, -62, 0, -26]] },
    upperArmR: { keys: [[0, -74, 0, 26], [0.5, -62, 0, 22], [1, -74, 0, 26]] },
    lowerArmL: { keys: [[0, 46, 0, 0], [0.5, 34, 0, 0], [1, 46, 0, 0]] },
    lowerArmR: { keys: [[0, 34, 0, 0], [0.5, 46, 0, 0], [1, 34, 0, 0]] },
  }));

  /* ---- crawl: no working legs, hauling on the arms ----
     The skeleton stays upright, so the crawl is made by folding the whole
     figure at the hips and packing the legs away behind it. Rotating the
     actor instead would fight the controller, which owns yaw and nothing
     else. */
  clips.push(buildClip('zcrawl', 1.6, {
    hips: { keys: [[0, 74, -6, 0], [0.5, 78, 6, 0], [1, 74, -6, 0]] },
    spine: { keys: [[0, -16, 4, 0], [0.5, -20, -4, 0], [1, -16, 4, 0]] },
    chest: { keys: [[0, -10, 6, 0], [0.5, -8, -6, 0], [1, -10, 6, 0]] },
    head: { keys: [[0, -46, 6, 0], [0.5, -44, -6, 0], [1, -46, 6, 0]] },
    // Legs folded up and back, dragging uselessly.
    upperLegL: { keys: [[0, -72, 0, 10], [0.5, -66, 0, 12], [1, -72, 0, 10]] },
    upperLegR: { keys: [[0, -66, 0, -12], [0.5, -72, 0, -10], [1, -66, 0, -12]] },
    lowerLegL: { keys: [[0, 84, 0, 0], [0.5, 76, 0, 0], [1, 84, 0, 0]] },
    lowerLegR: { keys: [[0, 76, 0, 0], [0.5, 84, 0, 0], [1, 76, 0, 0]] },
    // Arms alternate: reach far forward, then haul the body over.
    upperArmL: { keys: [[0, -96, 0, -18], [0.35, -40, 0, -26], [0.7, -20, 0, -20], [1, -96, 0, -18]] },
    upperArmR: { keys: [[0, -20, 0, 20], [0.35, -96, 0, 18], [0.7, -50, 0, 26], [1, -20, 0, 20]] },
    lowerArmL: { keys: [[0, 12, 0, 0], [0.35, 44, 0, 0], [1, 12, 0, 0]] },
    lowerArmR: { keys: [[0, 44, 0, 0], [0.35, 12, 0, 0], [1, 44, 0, 0]] },
  }));

  /* ---- tearing at a barricade ---- */
  clips.push(buildClip('ztear', 1.05, {
    hips: { keys: [[0, 2, 0, 0], [0.5, 6, 0, 0], [1, 2, 0, 0]] },
    spine: { keys: [[0, 12, -6, 0], [0.5, 20, 6, 0], [1, 12, -6, 0]] },
    chest: { keys: [[0, 6, -8, 0], [0.5, 10, 8, 0], [1, 6, -8, 0]] },
    head: { keys: [[0, -14, -6, -4], [0.5, -18, 6, 4], [1, -14, -6, -4]] },
    // Both arms rip downward, out of phase, so the pull never stops.
    upperArmL: { keys: [[0, -118, 0, -20], [0.28, -30, 0, -30], [0.55, -110, 0, -22], [1, -118, 0, -20]] },
    upperArmR: { keys: [[0, -34, 0, 28], [0.28, -114, 0, 20], [0.55, -30, 0, 30], [1, -34, 0, 28]] },
    lowerArmL: { keys: [[0, 20, 0, 0], [0.28, 62, 0, 0], [1, 20, 0, 0]] },
    lowerArmR: { keys: [[0, 58, 0, 0], [0.28, 18, 0, 0], [1, 58, 0, 0]] },
    upperLegL: { keys: [[0, 6, 0, 4], [1, 6, 0, 4]] },
    upperLegR: { keys: [[0, -4, 0, -4], [1, -4, 0, -4]] },
  }));

  /* ---- lunge: the swipe that lands a hit ---- */
  clips.push(buildClip('zattack', 0.62, {
    hips: { keys: [[0, 2, 0, 0], [0.4, 12, 0, 0], [1, 2, 0, 0]] },
    spine: { keys: [[0, 14, 0, 0], [0.35, 26, 0, 0], [1, 14, 0, 0]] },
    head: { keys: [[0, -12, 0, 0], [0.35, -30, 0, 0], [1, -12, 0, 0]] },
    upperArmL: { keys: [[0, -40, 0, -18], [0.3, -128, 0, -34], [0.6, -96, 0, -10], [1, -40, 0, -18]] },
    upperArmR: { keys: [[0, -44, 0, 18], [0.36, -132, 0, 34], [0.66, -92, 0, 10], [1, -44, 0, 18]] },
    lowerArmL: { keys: [[0, 40, 0, 0], [0.3, 8, 0, 0], [1, 40, 0, 0]] },
    lowerArmR: { keys: [[0, 44, 0, 0], [0.36, 10, 0, 0], [1, 44, 0, 0]] },
  }, { loop: false }));

  /* ---- tearing a piece out of itself ----
     The far arm crosses the body, digs into the flank, and pulls. The spine
     folds around the hand rather than the hand simply moving to the ribs,
     which is the difference between reaching for something and wrenching
     something loose. */
  clips.push(buildClip('zrip', 1.25, {
    hips: { keys: [[0, 3, 6, 0], [0.4, 5, 12, 0], [0.7, 4, 4, 0], [1, 3, 6, 0]] },
    spine: { keys: [[0, 14, -10, -6], [0.4, 24, -22, -14], [0.7, 16, -8, -6], [1, 14, -10, -6]] },
    chest: { keys: [[0, 8, -8, -4], [0.4, 14, -18, -10], [1, 8, -8, -4]] },
    head: { keys: [[0, -14, -12, 0], [0.4, -6, -26, -6], [0.75, -18, -6, 0], [1, -14, -12, 0]] },
    // Right hand crosses to the left flank, grips, and hauls outward.
    upperArmR: { keys: [[0, -30, 0, 34], [0.3, -78, 0, 62], [0.5, -74, 0, 58], [0.75, -40, 0, 20], [1, -30, 0, 34]] },
    lowerArmR: { keys: [[0, 40, 0, 0], [0.3, 104, 0, 0], [0.5, 96, 0, 0], [0.75, 30, 0, 0], [1, 40, 0, 0]] },
    upperArmL: { keys: [[0, -18, 0, -18], [0.4, -34, 0, -30], [1, -18, 0, -18]] },
    lowerArmL: { keys: [[0, 44, 0, 0], [0.4, 62, 0, 0], [1, 44, 0, 0]] },
  }, { loop: false }));

  /* ---- the last one: tearing at its own face ---- */
  clips.push(buildClip('zripface', 1.35, {
    spine: { keys: [[0, 14, 0, 0], [0.45, 22, 0, 0], [1, 14, 0, 0]] },
    head: { keys: [[0, -12, 0, 0], [0.35, 16, 8, 0], [0.7, 4, -6, 0], [1, -12, 0, 0]] },
    // Both hands to the face, then wrenched away and down.
    upperArmR: { keys: [[0, -34, 0, 30], [0.3, -142, 0, 26], [0.55, -128, 0, 34], [0.8, -50, 0, 24], [1, -34, 0, 30]] },
    upperArmL: { keys: [[0, -34, 0, -30], [0.3, -138, 0, -26], [0.55, -124, 0, -34], [0.8, -46, 0, -24], [1, -34, 0, -30]] },
    lowerArmR: { keys: [[0, 40, 0, 0], [0.3, 92, 0, 0], [0.55, 84, 0, 0], [1, 40, 0, 0]] },
    lowerArmL: { keys: [[0, 40, 0, 0], [0.3, 90, 0, 0], [0.55, 82, 0, 0], [1, 40, 0, 0]] },
  }, { loop: false }));

  /* ---- the throw, for the ones that spit ---- */
  clips.push(buildClip('zspit', 0.95, {
    hips: { keys: [[0, 2, -14, 0], [0.45, 4, 16, 0], [1, 2, -14, 0]] },
    spine: { keys: [[0, 10, -20, 0], [0.45, 18, 22, 0], [1, 10, -20, 0]] },
    chest: { keys: [[0, 6, -16, 0], [0.45, 8, 18, 0], [1, 6, -16, 0]] },
    head: { keys: [[0, -18, -8, 0], [0.45, -24, 8, 0], [1, -18, -8, 0]] },
    // Right arm winds back over the shoulder, then whips through.
    upperArmR: { keys: [[0, -20, 0, 40], [0.3, -150, 0, 30], [0.5, -70, 0, 12], [1, -20, 0, 40]] },
    lowerArmR: { keys: [[0, 30, 0, 0], [0.3, 96, 0, 0], [0.5, 6, 0, 0], [1, 30, 0, 0]] },
    upperArmL: { keys: [[0, -50, 0, -22], [0.45, -30, 0, -16], [1, -50, 0, -22]] },
    lowerArmL: { keys: [[0, 40, 0, 0], [1, 40, 0, 0]] },
  }, { loop: false }));

  /* ---- standing idle, for the moment before it notices you ---- */
  clips.push(buildClip('zidle', 4.2, {
    spine: { keys: [[0, 14, -2, 2], [0.5, 16, 2, -2], [1, 14, -2, 2]] },
    head: { keys: [[0, -10, 5, -8], [0.5, -13, -5, -5], [1, -10, 5, -8]] },
    upperArmL: { keys: [[0, -14, 0, -14], [0.5, -10, 0, -16], [1, -14, 0, -14]] },
    upperArmR: { keys: [[0, -10, 0, 16], [0.5, -14, 0, 14], [1, -10, 0, 16]] },
    lowerArmL: { keys: [[0, 40, 0, 0], [0.5, 46, 0, 0], [1, 40, 0, 0]] },
    lowerArmR: { keys: [[0, 46, 0, 0], [0.5, 40, 0, 0], [1, 46, 0, 0]] },
  }));

  return clips;
}
