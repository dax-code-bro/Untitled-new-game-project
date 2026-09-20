/* ==================================================================
   THE INSPECT
   ==================================================================

   Neither game had one. You could fire a weapon, reload it, sprint with
   it and swap off it, and never once look at it -- which on a project
   whose whole argument is that the guns are modelled properly is the
   one animation whose absence costs the most.

   It is a curve rather than a clip, because a viewmodel is not a
   skeleton: it is one actor held at an offset from the eye, and the
   thing that has to move is the offset. So this returns, for a fraction
   `u` through the inspect, how far the weapon is drawn in toward the
   face, where it has moved on the screen, how it is turned, and how far
   the action is opened -- and each game applies those in its own basis.
   The shape is therefore identical in both, which is the whole point of
   it living here.

   FIVE BEATS, and they are the five things a person actually does:

     0.00 - 0.18   up and in, out of the carry toward the face
     0.18 - 0.42   rolled over to show the ejection side, action cracked
                   open far enough to see brass in the chamber
     0.42 - 0.58   held there; the action closes
     0.58 - 0.80   rolled the other way and tipped down, looking at the
                   magazine, and the support hand taps its base
     0.80 - 1.00   back to the carry

   SIGNS. +X out along the bore, +Y up, +Z the weapon's right -- so the
   ejection port is +Z and rolling to see it is a positive roll about
   the bore. `side` is positive to the shooter's right. Every angle is
   in radians, because both callers build quaternions from these. */

/* How long one takes. Long enough to read, short enough that nobody
   feels trapped in it: a weapon inspect that outlasts a gunfight is a
   weapon inspect nobody presses twice. */
const INSPECT_TIME = 2.05;

/* CANCELLING ONE.
 *
   Everything cancels an inspect -- firing, aiming, sprinting, reloading,
   swapping, dying -- and the first version of both games did it by
   setting the clock to zero, which teleports the weapon back to the
   carry between two frames. Measured on the curve: a cancel at u = 0.5
   is a 1.18 radian snap in a sixteenth of a second, which is the exact
   fault this whole animation pass exists to remove.

   Rewinding the clock does not fix it either, because the pose is read
   from the clock: move the clock and the weapon moves with it, which is
   the same jump by another route.

   So a cancel fades the whole pose out instead. `w` scales every
   channel, the caller runs it from 1 down to 0 over CANCEL_TIME, and
   the weapon comes back to the carry along whatever line it was on --
   smoothly, from wherever it had got to, in every channel at once. The
   clock keeps running underneath so an inspect that is cancelled and
   then finishes does not restart. */
const INSPECT_CANCEL = 0.14;

function inspectPose(u, w) {
  const t = Math.max(0, Math.min(1, u));
  const ease = (a) => a * a * (3 - 2 * a);
  const seg = (a, b) => ease(Math.max(0, Math.min(1, (t - a) / (b - a))));
  /* A window that rises over [a,b] and falls again over [c,d] -- which
     is what nearly every beat of this is, because the weapon always
     comes back. */
  const win = (a, b, c, d) => seg(a, b) * (1 - seg(c, d));

  /* Up and in for the whole of it, out at both ends. The draw-in is
     what makes it read as looking AT something rather than as the gun
     drifting: 62 mm closer, which at the hold distance is about a
     fifth again in apparent size. */
  const hold = win(0.00, 0.18, 0.84, 1.00);

  /* Beat two: over onto its right side, port up. Not a full ninety --
     at ninety the receiver is edge on and you see less of it than at
     seventy, and the sights go through the middle of the frame. */
  const overR = win(0.10, 0.34, 0.50, 0.62);
  /* Beat four: the other way, muzzle down, looking at the magazine. */
  const overL = win(0.56, 0.72, 0.86, 0.98);

  /* The action, cracked open on the first roll and shut on the way out
     of it -- the check that there is a round in the chamber, which is
     the reason anybody looks at the side of a receiver at all. */
  const bolt = win(0.20, 0.32, 0.44, 0.54);
  /* And the tap on the base of the magazine, on the second roll. One
     short push, not a hold. */
  const tap = win(0.64, 0.70, 0.72, 0.79);

  /* The fade, eased so a cancel does not leave at speed either. */
  const g = w == null ? 1 : Math.max(0, Math.min(1, w));
  const k = g * g * (3 - 2 * g);
  if (k <= 0) return { in: 0, up: 0, side: 0, yaw: 0, pitch: 0, roll: 0, bolt: 0, tap: 0 };
  return {
    /* Toward the eye, metres. */
    in: k * hold * 0.062,
    /* Up and inboard, so it sits in the middle of the frame rather than
       out over the shoulder where it is carried. */
    up: k * hold * 0.030,
    side: -k * hold * 0.052,
    /* Turned to face the shooter a little, both ways. Muzzle swings
       inboard on the first roll and out on the second. */
    yaw: k * (overR * 0.20 - overL * 0.12),
    /* Muzzle up to read the receiver, down to read the magazine. */
    pitch: k * (overR * 0.16 - overL * 0.30),
    /* The roll is the inspect. */
    roll: k * (overR * 1.18 - overL * 0.62),
    /* 0..1, for whatever the weapon's action is: a bolt drawn back, a
       cylinder swung out, a break gun cracked. poseAction takes it on
       its `hand` channel, which is the hand-worked stroke. */
    bolt: k * bolt,
    /* 0..1, the support hand's tap on the magazine base. */
    tap: k * tap,
  };
}
