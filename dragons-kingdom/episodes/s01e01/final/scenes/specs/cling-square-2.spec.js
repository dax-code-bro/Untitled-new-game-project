// Shot specs - CLING_SQUARE_2: the rest of the Cling square in scene 1C (X5-10..18, R3-01..04). Session 34: first wiring.
// A SECOND spec on the CLING_SQUARE shots (registry CLING_SQUARE_2, shotSet CLING_SQUARE): its own scene file
// (cling-square-2.js) and table; builder sets/cling-square-2.js = sets/cling-square.js's build() as-is + the house by
// the arch with an OPEN door and a room behind it, the parcel, the first banner, the lute, the pipe, far birds.
// cling-square.spec.js / sets/cling-square.js are not touched. Positions: CLING frame (+x east, -z north, y up, m).
//   DOOR frame (helpers D / D3): the west-row door 5 m south of the arch, centre of its front at [-19.81, 21.68];
//   lat + = north (screen right from the square), dep + = into the house (west); facing OUT = 91.3, IN = 271.3.
//   room: lat -1.8..1.8, dep 0.5..3.7, 2.75 high; table centre lat 0, dep 1.4, top 0.76
//   fountain [0, -2] (rim r ~3, 0.72 high)   stall [-8.5, 3] (vendor behind the cart at ~[-8.6, 0.7])
//   watchman's platform: deck 4.7 m, x 18.6..21.8, z -2.4..0.6; its ladder from the square at x 18.2, z -0.9
//   banner rope: north-row front [3, 5.4, -17.45] -> fountain pillar top [0, 3.25, -2]
// CAST (characters.py builds for the roles): parent (adult woman), child (the CHILD: a child build), musician (adult
// man, lute), vendor (adult man), watchman (adult man), guard1 (adult man).
// RATING: R3-02..04 (the musician's pipe, adult background behaviour per the script) cast NO child; R3-01 sends the
// child inside and shuts the door first. The pipe is a small clay pipe and a thin wisp; no close-up, nothing shown of
// what is in it.

const D = (lat, dep) => [+(-19.81 + 0.023 * lat - dep).toFixed(3), +(21.68 - lat - 0.023 * dep).toFixed(3)];
const D3 = (lat, y, dep) => { const [x, z] = D(lat, dep); return [x, y, z]; };
const OUT = 91.3, IN = 271.3;
const STALL_UP = { poles: 1, bars: 1, cloth: 1, low: 0.55 };
// the musician on the fountain rim (north-east side, root 3.15 m out: the seat on the coping), facing out (NE); f = his forward, r = his right
const M = [2.23, -4.23], f = [0.707, -0.707], r = [0.707, 0.707];
const at = (p, a, b = 0, y) => { const q = [p[0] + f[0] * a + r[0] * b, p[1] + f[1] * a + r[1] * b]; return y == null ? q : [q[0], y, q[1]]; };
const SEAT = 0.2;                                     // root raised so the sit posture's seat is on the 0.72 m rim
const LAP = at(M, 0.34, 0, 0.98);                     // hands holding the lute
const VEND = [2.58, -5.78];                           // the vendor beside him (his left, screen right)
const LUTE_LAP = [...at(M, 0.3, 0.02, 0.9), -45, 0];   // across the knees, body to his right
const PIPE = at(M, 0.24, 0.07, 1.36);                 // the pipe hand, just below his chin (no close-up)
const BOWL = [PIPE[0], PIPE[1] + 0.06, PIPE[2]];
const playing = { holds: { object: 'lute', hands: 'both', offset: [0, 0, 0.02], rot: 180 }, acts: [[0, 'handsTo', { at: LAP, in: 0.01, hold: 20, out: 0.3, spread: 0.34 }]] };
const musician = (o = {}) => ({ at: M, face: 45, y: SEAT, posture: { sit: 1 }, legs: 'planted', ...o });

export default {
  set: 'CLING_SQUARE_2',
  cast: {
    parent: { kind: 'human', id: 'parent' },
    child: { kind: 'human', id: 'child' },
    musician: { kind: 'human', id: 'musician' },
    vendor: { kind: 'human', id: 'vendor' },
    watchman: { kind: 'human', id: 'watchman' },
    guard: { kind: 'human', id: 'guard1' },
  },
  shots: {
    'X5-10': {
      staging: 'MEDIUM 50 mm STATIC through the OPEN door of the house by the stone arch (the door frame inside the frame): inside, the PARENT at the table wraps a parcel in undyed cloth and knots it; the CHILD stands at the right edge of the doorway watching. Warm light inside.',
      cam: { rig: 'static', pos: D3(0.15, 1.45, -4.6), look: D3(0, 1.0, 1.7), mm: 50, fstop: 4, focus: D3(0, 0.9, 1.5) },
      set: { shadowAt: D3(0, 0, 1), shadowExtent: 9, door: 1, room: { lamp: 4 }, parcel: [-0.05, 0.765, 1.4] },
      cast: {
        parent: { at: D(0.0, 2.05), face: OUT, look: D3(-0.05, 0.8, 1.4), lookAmount: 0.85, acts: [
          [0.1, 'handsTo', { at: D3(-0.05, 0.84, 1.42), in: 0.4, hold: 1.8, out: 0.3, spread: 0.24 }],
          [2.7, 'handsTo', { at: D3(-0.05, 0.9, 1.42), in: 0.3, hold: 1.7, out: 0.3, spread: 0.08 }],
        ] },
        child: { at: D(0.47, 0.9), face: [-21.2, 21.3], look: D3(-0.05, 0.8, 1.4), lookAmount: 0.8 },
      },
      deviation: 'the cloth is already round the parcel (no folding cloth sim): her hands work over it, then knot it; the warmth fogging the cloth is not drawn',
    },
    'X5-11': {
      staging: 'MEDIUM 50 mm STATIC through the doorway, a little nearer: the CHILD (right) reaches for the parcel; the PARENT slides it gently out of reach to her side of the table - not yet.',
      cam: { rig: 'static', pos: D3(0.3, 1.3, -3.9), look: D3(0.1, 0.95, 1.4), mm: 50, fstop: 4, focus: D3(0.15, 0.9, 1.2) },
      set: { shadowAt: D3(0, 0, 1), shadowExtent: 9, door: 1, room: { lamp: 4 }, parcel: [[0, [0.18, 0.765, 1.25]], [0.95, [0.18, 0.765, 1.25]], [1.55, [-0.42, 0.765, 1.6], 'smooth']] },
      cast: {
        parent: { at: D(0.0, 2.05), face: OUT, look: 'child.head', lookAmount: 0.7, acts: [
          [0.6, 'handsTo', { at: 'parcel', in: 0.35, hold: 0.8, out: 0.4, spread: 0.2 }],
          [0.6, 'look', { at: 'parcel', amount: 0.7, blend: 0.3 }],
          [1.8, 'look', { at: 'child.head', amount: 0.8, blend: 0.4 }],
          [2.0, 'nod', { in: 0.2, hold: 0.2, out: 0.2 }],
        ] },
        child: { at: D(0.5, 0.85), face: [-21.25, 21.4], look: 'parcel', lookAmount: 0.85, acts: [
          [0.25, 'reach', { side: 'R', at: D3(0.2, 0.82, 1.2), in: 0.45, hold: 0.5, out: 0.5 }],
          [1.7, 'look', { at: 'parent.head', amount: 0.8, blend: 0.4 }],
        ] },
      },
    },
    'X5-12': {
      staging: 'WIDE 35 mm STATIC from the square: the house by the arch, its door open; the CHILD comes to the doorway and stands on the step looking up across the square, where the banners are going up.',
      cam: { rig: 'static', pos: [-10.8, 1.6, 22.9], look: D3(0, 1.5, 0.3), mm: 35, fstop: 8, focus: D3(0, 1, 0) },
      set: { shadowAt: D3(0, 0, -3), shadowExtent: 16, door: 1, room: { lamp: 4 }, parcel: [-0.42, 0.765, 1.6], banner: { unroll: 1, lift: 0.5 } },
      cast: {
        child: { at: D(0.3, 0.95), face: OUT, legs: 'planted', look: [-6, 5.5, 8], lookAmount: 0.6, acts: [[0.1, 'walk', { to: D(0.15, -0.1), speed: 0.85, stop: 0.4 }], [1.4, 'look', { at: [-4, 6.5, 2], amount: 0.9, blend: 0.5 }]] },
      },
    },
    'X5-13': {
      staging: 'MEDIUM 50 mm STATIC, three-quarter front: the MUSICIAN sits on the fountain rim with his lute across his lap, tilts his head to it and tests it (tuning notes are sound); one fastening is loose.',
      cam: { rig: 'static', pos: [3.92, 1.15, -7.24], look: [2.12, 1.0, -4.12], mm: 50, fstop: 4, focus: 'musician.head' },
      set: { shadowAt: [2, 0, -4], shadowExtent: 8, stall: STALL_UP },
      cast: { musician: musician({ ...playing, look: LAP, lookAmount: 0.75, acts: [...playing.acts, [2.4, 'nod', { in: 0.25, hold: 0.4, out: 0.3 }]] }) },
      deviation: 'the thumb on the loose fastening is not posed (both hands hold the lute); the instrument is a lute (characters.py: a proposal)',
    },
    'X5-14': {
      staging: 'MEDIUM 50 mm STATIC TWO-SHOT: the musician (left, seated on the rim with his lute) and the VENDOR (right, standing at his side) - an old conversation between friends; the vendor\'s stall in the background right.',
      cam: { rig: 'static', pos: [5.33, 1.4, -8.5], look: [2.18, 1.2, -4.75], mm: 50, fstop: 4.5, focus: [2.18, 1.3, -4.75] },
      set: { shadowAt: [2, 0, -5], shadowExtent: 9, stall: STALL_UP },
      lines: [['X5-01', 0.35], ['X5-02', 0.25], ['X5-03', 0.25]],
      cast: {
        musician: musician({ ...playing, look: 'vendor.head', lookAmount: 0.7 }),
        vendor: { at: VEND, face: M, look: 'musician.head', lookAmount: 0.8, acts: [[2.0, 'headShake', { in: 0.2, hold: 0.4, out: 0.2 }]] },
      },
    },
    'R3-01': {
      staging: 'WIDE 35 mm STATIC across the square: at the house by the arch (left) the PARENT in the doorway calls the CHILD in; the child goes inside, and the door swings shut.',
      cam: { rig: 'static', pos: [-6.0, 1.8, 14.0], look: [-16.2, 1.7, 18.0], mm: 35, fstop: 8, focus: D3(0, 1, 0) },
      set: { shadowAt: D3(0, 0, -4), shadowExtent: 16, door: [[0, 1], [1.5, 1], [2.3, 0, 'smooth']], room: { lamp: 4 }, parcel: [-0.42, 0.765, 1.6], banner: { unroll: 1, lift: 0.5 } },
      cast: {
        parent: { at: D(-0.2, 0.35), face: OUT, look: 'child.head', lookAmount: 0.8, acts: [
          [0.0, 'wave', { side: 'R', in: 0.2, hold: 0.45, out: 0.25 }],
          [0.6, 'walk', { to: D(-0.4, 1.4), speed: 1.0 }], [1.5, 'hide'],
        ] },
        child: { at: D(0.25, -0.45), face: IN, legs: 'planted', look: 'parent.head', lookAmount: 0.6, acts: [[0.3, 'walk', { to: D(0.3, 0.9), speed: 1.15 }], [1.5, 'hide']] },
      },
      notes: 'the door leaf swings shut 1.5-2.3 s (set.door keys); both are hidden behind it from 1.5 s',
    },
    'R3-02': {
      staging: 'MEDIUM STATIC (40 mm, to hold the stall in the background): the musician (centre, lute laid across his knees) takes a small clay pipe from his coat, lights it and draws; a thin smoke drifts across the fountain. The VENDOR at his stall in the background right looks over - he knows what it is. No child in the shot or in sight of it.',
      cam: { rig: 'static', pos: [5.27, 1.25, -7.87], look: [1.55, 1.05, -4.52], mm: 40, fstop: 5.6, focus: 'musician.head' },
      set: { shadowAt: [-2, 0, -2], shadowExtent: 14, stall: STALL_UP, luteLap: LUTE_LAP },
      fx: [{ kind: 'smoke-wisp', from: 1.7, at: BOWL, params: { kind: 'pipe' } }],
      cast: {
        musician: musician({ look: [3.4, 0.9, -5.4], lookAmount: 0.5, holds: { object: 'pipe', hands: 'R', from: 0.55, offset: [0, 0.01, 0] }, acts: [
          [0.15, 'reach', { side: 'R', at: at(M, 0.25, 0.1, 1.05), in: 0.35, hold: 0.2, out: 0.01 }],
          [0.7, 'reach', { side: 'R', at: PIPE, in: 0.5, hold: 3.4, out: 0.3 }],
          [1.0, 'reach', { side: 'L', at: at(M, 0.3, 0.0, 1.38), in: 0.35, hold: 0.55, out: 0.4 }],
          [1.0, 'look', { at: 'musician.hand.R', amount: 0.5, blend: 0.3 }], [2.2, 'look', { at: [0, 2.5, -9], amount: 0.4, blend: 0.6 }],
        ] }),
        vendor: { at: [-8.6, 0.7], face: 75, look: 'musician.head', lookAmount: 0.85 },
      },
      notes: 'NO_CHILD_IN_FRAME: the child is not cast (R3-01 took her inside)',
    },
    'R3-03': {
      staging: 'MEDIUM 50 mm STATIC TWO-SHOT, deadpan: the musician (left, pipe in his right hand at his knee, lute across his knees) and the vendor (right, standing at his side). No child in the shot.',
      cam: { rig: 'static', pos: [5.33, 1.4, -8.5], look: [2.18, 1.2, -4.75], mm: 50, fstop: 4.5, focus: [2.18, 1.3, -4.75] },
      set: { shadowAt: [2, 0, -5], shadowExtent: 9, stall: STALL_UP, luteLap: LUTE_LAP },
      lines: [['R3-01', 0.3], ['R3-02', 0.15], ['R3-03', 0.15], ['R3-04', 0.2]],
      fx: [{ kind: 'smoke-wisp', from: 0, at: [2.44, 1.0, -4.23], params: { kind: 'pipe' } }],
      cast: {
        musician: musician({ look: 'vendor.head', lookAmount: 0.6, holds: { object: 'pipe', hands: 'R', offset: [0, 0.01, 0] }, acts: [[0, 'reach', { side: 'R', at: [2.44, 0.98, -4.23], in: 0.01, hold: 20, out: 0.3 }]] }),
        vendor: { at: VEND, face: M, look: 'musician.head', lookAmount: 0.8, acts: [[4.6, 'headShake', { in: 0.2, hold: 0.3, out: 0.2 }]] },
      },
    },
    'R3-04': {
      staging: 'MEDIUM 40 mm STATIC: the vendor shakes his head and walks back round the fountain to his stall (background right); the musician (centre) smokes with his eyes down and closed, the lute across his knees. Thin smoke. No child in the shot.',
      cam: { rig: 'static', pos: [5.27, 1.25, -7.87], look: [1.55, 1.05, -4.52], mm: 40, fstop: 5.6, focus: 'musician.head' },
      set: { shadowAt: [-2, 0, -3], shadowExtent: 14, stall: STALL_UP, luteLap: LUTE_LAP },
      fx: [{ kind: 'smoke-wisp', from: 0, at: BOWL, params: { kind: 'pipe' } }],
      cast: {
        musician: musician({ look: at(M, 0.6, 0, 0.3), lookAmount: 0.7, holds: { object: 'pipe', hands: 'R', offset: [0, 0.01, 0] }, acts: [
          [0, 'reach', { side: 'R', at: PIPE, in: 0.01, hold: 20, out: 0.3 }],
          [0, 'reach', { side: 'L', at: at(M, 0.3, -0.1, 0.95), in: 0.01, hold: 20, out: 0.3 }],
        ] }),
        vendor: { at: VEND, face: M, legs: 'planted', look: 'musician.head', lookAmount: 0.6, acts: [
          [0.1, 'headShake', { in: 0.2, hold: 0.4, out: 0.2 }],
          [0.9, 'walk', { path: [VEND, [0.0, -6.4], [-3.4, -4.6], [-5.5, -1.5], [-8.4, 0.6]], speed: 1.25 }],
          [1.0, 'look', { at: [-8.5, 1.0, 3], amount: 0.5, blend: 0.5 }],
        ] },
      },
      deviation: 'eyes closed is read as the head and eyes down (no lid control from the director yet)',
    },
    'X5-15': {
      staging: 'WIDE 35 mm STATIC from the square, looking north-east at the town wall: the WATCHMAN climbs the last rungs of the ladder onto his raised platform on the wall, crosses to the parapet, turns to the fields and wraps his cloak round him against the chill. A guard below at the left.',
      cam: { rig: 'static', pos: [4.0, 2.4, 8.5], look: [19.0, 5.0, -1.0], mm: 35, fstop: 8, focus: [18.6, 4.5, -1] },
      set: { shadowAt: [17, 0, -1], shadowExtent: 14 },
      cast: {
        watchman: { at: [17.85, -0.9], face: 90, y: [[0, 2.5], [2.2, 4.7, 'smooth']], look: [18.4, 6.0, -0.9], lookAmount: 0.5, acts: [
          [0.0, 'reach', { side: 'R', at: [18.15, 4.0, -0.75], in: 0.3, hold: 0.35, out: 0.3 }],
          [0.75, 'reach', { side: 'L', at: [18.15, 4.9, -1.05], in: 0.3, hold: 0.35, out: 0.3 }],
          [1.5, 'reach', { side: 'R', at: [18.3, 5.6, -0.75], in: 0.3, hold: 0.3, out: 0.3 }],
          [2.3, 'walk', { to: [19.7, -0.5], speed: 0.9, stop: 0.4 }],
          [2.5, 'look', { at: [60, 6, -6], amount: 0.6, blend: 0.6 }],
          [3.6, 'turn', { to: 75, dur: 0.6 }],
          [3.9, 'handsTo', { at: [19.91, 6.0, -0.56], in: 0.45, hold: 2, out: 0.3, spread: 0.06 }],
        ] },
        guard: { at: [15.9, -4.2], face: [19, -1], look: 'watchman.head', lookAmount: 0.4 },
      },
      deviation: 'the climb is the last rungs only (no climbing cycle in the director: the root rises on keys, the hands reach rung to rung)',
    },
    'X5-16': {
      staging: 'MEDIUM-WIDE 35 mm STATIC from the square: the GUARD below (left) calls up without much interest; the WATCHMAN above on the platform (right) answers, looking down. Over-the-shoulder-ish on the guard (his face three-quarter back).',
      cam: { rig: 'static', pos: [5.0, 2.4, 4.8], look: [17.66, 3.86, -2.48], mm: 35, fstop: 5.6, focus: [17.6, 3.5, -2.3] },
      set: { shadowAt: [17, 0, -2], shadowExtent: 12 },
      lines: [['X5-04', 0.25], ['X5-05', 0.15], ['X5-06', 0.15], ['X5-07', 0.15]],
      deviation: '35 mm, not the listed 50 mm: on the Super 35 sensor a 50 mm cannot hold the guard below and the watchman 4.7 m above in one static frame',
      cast: {
        guard: { at: [16.2, -3.4], face: [19.0, -1.3], look: 'watchman.head', lookAmount: 0.75 },
        watchman: { at: [19.0, -1.3], face: [16.2, -3.4], look: 'guard.head', lookAmount: 0.7, acts: [[0, 'handsTo', { at: [18.75, 6.0, -1.45], in: 0.01, hold: 20, out: 0.3, spread: 0.06 }]] },
      },
    },
    'X5-17': {
      staging: 'POV 35 mm STATIC at the watchman\'s eyeline on the platform, looking east over the wall: roofs at the bottom, the fields, the broad road running away, and a wide, quiet sky with a few high clouds - nothing moves in it but birds. No foreshadowing.',
      cam: { rig: 'static', pos: [20.9, 6.32, -0.9], look: [70, 5.0, 6.0], mm: 35, fstop: 8, focus: 60 },
      set: { shadowAt: [40, 0, 0], shadowExtent: 40, flock: { c: [58, 16, -2], r: 10, n: 5, size: 1.8, speed: 0.08 } },
    },
    'X5-18': {
      staging: 'WIDE 35 mm STATIC from the south-east of the square: the FIRST BANNER unrolls along its rope from a house on the north side down to the fountain pillar - the roll slides down the rope paying out ochre and woad cloth - and then lifts in the breeze.',
      cam: { rig: 'static', pos: [9.0, 1.9, 7.5], look: [1.0, 3.9, -9.5], mm: 35, fstop: 8, focus: [1.5, 4.2, -9.5] },
      set: { shadowAt: [0, 0, -8], shadowExtent: 26, stall: STALL_UP, banner: { unroll: [[0, 0.0], [0.3, 0.03], [2.2, 1, 'smooth']], lift: [[0, 0], [1.6, 0.05], [3.3, 1, 'smooth']] } },
    },
  },
};
