# The gait generator

`walk`, `run`, `sprint`, `crouchWalk` and `crouchRun` in
`engine/src/90-animation.js` are not hand-written. They are emitted by
these four files, and the keyframe tables in the engine are their output.

    node engine/tools/gait-report.js          # measure, do not emit
    node engine/tools/gait-emit.js > /tmp/clips.txt

Why: the hand-written versions had both feet permanently behind the
pelvis, because two comments in the engine asserted that a positive
upper leg is forward and it is not. Writing the angles again would have
been a better guess. These say where the FOOT goes instead -- planted
and carried back by the ground through stance, arcing over through swing
-- and solve the hip, the knee and the pelvis height that put it there.
A gait built that way cannot slide, cannot sink through the floor and
cannot have its phases mirrored, because those are properties of the
path and the path is the input.

  gait-solve.js   the IK, the ankle path, the pelvis solve, the settle
  gait-defs.js    one entry per gait: stance fraction, stride, foot
                  clearance, the stance knee profile, the sole angles,
                  and the trunk and arm curves
  gait-emit.js    prints the keyframe tables to paste into the engine
  gait-report.js  prints reach, floor clearance, pelvis bob and stride

`engine/test/motion.test.js` holds the result to account, and does it
without a browser.
