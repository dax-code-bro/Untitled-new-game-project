// Shot specs - CLING_SQUARE: scene 1C in Cling, the morning before the festival (X5-01 .. X5-09). Session 33: first wiring.
// Builder: scenes/lib/director/sets/cling-square.js = the architecture library's clingSquare() (the CLING layout: houses,
// roofs, stone from the same builders / materials as VERDOR_AERIAL + VERDOR_HARBOR) on loadClingLand(), plus the vendor's
// stall + handcart, the ladder, the music dais, the watchman's platform and pigeons. Positions: CLING frame (+x east,
// -z north, y up, metres; the paving at y ~0.03).
//   fountain [0, -2] (basin r 3, pillar 3.4 m)   steps x 4, z 18 rising south   support [13.3, 19.4]
//   arch [-19.6, 16.5] (west)   gate [20.4, 4.75] (east, the broad road beyond)   alley x -8.6 (north row gap)
//   music space [7, 1.5] (dais)   watchman's platform on the wall north of the gate: deck 4.7 m, x 18.6..21.8, z -2.4..0.6
//   STALL (builder STALL): poles fl [-9.85, 4.05] fr [-7.15, 4.05] (2.1 m) bl [-9.85, 1.75] br [-7.15, 1.75] (2.4 m);
//         cloth corners overhang 0.12 / 0.15; fl = the front-left corner (screen left from the square) = the LOW one;
//         the cart parks at [-8.5, 3.0] shafts north, the vendor works behind it (north side)
// Sun 1C here (registry): az 132, el 12 - low from the south-east behind the steps: long shadows to the north-west.
// CAST: vendor (the 'vendor' build, an adult man); villagers with the ladder crowd02 + crowd08 (adult men, characters.py
// ages 0.5 / 0.46); a woman crossing in X5-09 crowd03 (adult, 0.7). No children in these shots.
// T11 "CLING — SCRAPPER" is a caption of X5-01 (the cut burns it in from the edit list; nothing is drawn in 3D).

const CART_START = [-8.5, -1.25];                         // the vendor's start in X5-04 (the cart runs 2.35 m ahead of him)
const VENDOR_PARK = [-8.5, 0.65];                         // where he stops: the cart then stands at [-8.5, 3.0]
const LOW = 0.55;                                         // the front-left corner hangs this much lower (shoulder height ~1.58 m)
const STALL_UP = { poles: 1, bars: 1, cloth: 1 };
// X5-07: the ladder (4.8 m) on the left shoulders of vilA (front) and vilB (3.2 m behind), walking east along z 4.75 at
// 1.3 m/s (acc 0.05: near constant speed); its front end reaches the low corner (x -9.97) at ~1.2 s and drags it 1 m
const LADDER_Z = 4.75;

export default {
  set: 'CLING_SQUARE',
  cast: {
    vendor: { kind: 'human', id: 'vendor' },
    vilA: { kind: 'human', id: 'crowd02' },
    vilB: { kind: 'human', id: 'crowd08' },
    walker: { kind: 'human', id: 'crowd03' },
  },
  shots: {
    'X5-01': {
      staging: 'INSERT 100 mm STATIC, low on the paving east of the alley line: the cart\'s iron-tyred wheel rolls through frame south over the uneven setts and jolts on a proud stone (~1.35 s), a smaller knock at ~2.3 s. The vendor (out of frame) pushes. Location caption T11 over it (from the edit list).',
      cam: { rig: 'static', pos: [-3.4, 0.24, -6.2], look: [-7.83, 0.3, -6.65], mm: 100, fstop: 4, focus: [-7.83, 0.3, -6.65] },
      set: {
        shadowAt: [-7.8, 0, -6.6], shadowExtent: 6,
        stall: { cart: [[0, [-8.5, -7.65]], [3, [-8.5, -5.85], 'linear']], lift: 0.3, poles: 0, bars: 0, cloth: 0,
          jolt: [[0, 0], [1.28, 0], [1.36, 0.035, 'linear'], [1.55, 0], [2.25, 0], [2.3, 0.018, 'linear'], [2.45, 0]] },
      },
      captions: [{ text: 'CLING — SCRAPPER', from: 0.25, to: 2.95, style: 'location' }],
      notes: 'T11 (onscreen-text.json) is a caption here, burned in by the cut. Sound: wheel on stone, the jolt.',
    },
    'X5-02': {
      staging: 'WIDE 35 mm STATIC from the king\'s steps looking north: the square nearly empty, the fountain running round its stone pillar at the centre, long morning shadows of the south-east sun stretching north-west across the setts; a pigeon on a ridge. The festival has not begun (no stall yet).',
      cam: { rig: 'static', pos: [3.0, 2.15, 19.8], look: [-0.6, 1.7, -4], mm: 35, fstop: 8, focus: [0, 1.5, -2] },
      set: { shadowAt: [0, 0, 0], shadowExtent: 42, birds: [{ perch: 0, yaw: 40, peck: true }] },
    },
    'X5-03': {
      staging: 'WIDE 35 mm slow TRAVELING PAN round the square from beside the fountain (the camera drifts 6 m east): the king\'s steps, then left across the south-west corner to the stone arch, the alley behind the stall place, over the fountain to the music space (the empty dais) and on to the gate onto the broad road. Unlabelled: the map of the attack.',
      cam: {
        rig: 'follow',
        pos: [[0, [-1.2, 1.75, 6.4]], [8, [4.6, 1.75, 8.6], 'smooth']],
        look: [[0, [4.0, 1.3, 19.5]], [2.1, [-19.6, 2.8, 16.5]], [4.3, [-8.6, 2.6, -18]], [6.1, [7.0, 1.2, 1.5]], [8, [20.4, 2.6, 4.75]]],
        mm: 35, fstop: 8, focus: 14,
      },
      set: { shadowAt: [0, 0, 2], shadowExtent: 46 },
      notes: 'look keys sweep ~280 deg in 8 s (the landmarks ring the square); judge the pan speed in the video',
    },
    'X5-04': {
      staging: 'MEDIUM 50 mm STATIC from the south-west of the stall place: the VENDOR pushes his handcart in from the alley side and parks it (~2.4 s), then stands the back poles, tips up the front frame (two poles and the crossbar), drops the back crossbar on and throws the cloth roof forward over them.',
      cam: { rig: 'static', pos: [-5.0, 1.7, 10.9], look: [-8.7, 1.35, 2.0], mm: 50, fstop: 5.6, focus: [-8.5, 1.4, 1.6] },
      set: {
        shadowAt: [-8.5, 0, 2.5], shadowExtent: 9,
        stall: { cart: 'follow', followUntil: 2.6, poles: [[[0, 0], [3.3, 0], [3.9, 1]], [[0, 0], [3.3, 0], [3.9, 1]], [[0, 0], [2.5, 0], [2.95, 1]], [[0, 0], [2.85, 0], [3.3, 1]]],
          bars: [[[0, 0], [3.3, 0], [3.9, 1]], [[0, 0], [4.0, 0], [4.4, 1]]], cloth: [[0, 0], [4.5, 0], [5.6, 1]] },
      },
      cast: {
        vendor: {
          at: CART_START, face: 180, legs: 'planted', look: [-8.5, 1.0, 3.5], lookAmount: 0.5,
          acts: [
            [0, 'walk', { to: VENDOR_PARK, speed: 0.85, acc: 0.3, stop: 0.5 }],
            [0, 'handsTo', { at: 'cartGrip', in: 0.01, hold: 2.3, out: 0.3, spread: 0.36 }],
            [2.5, 'reach', { side: 'L', at: [-9.85, 2.2, 1.75], in: 0.3, hold: 0.25, out: 0.3 }],
            [2.85, 'reach', { side: 'R', at: [-7.15, 2.2, 1.75], in: 0.3, hold: 0.25, out: 0.3 }],
            [3.3, 'handsTo', { at: [-8.5, 1.95, 2.6], in: 0.3, hold: 0.4, out: 0.3, spread: 0.3 }],
            [3.3, 'look', { at: [-8.5, 2.0, 4.0], amount: 0.7, blend: 0.4 }],
            [4.0, 'handsTo', { at: [-8.5, 2.35, 1.8], in: 0.3, hold: 0.3, out: 0.3, spread: 0.4 }],
            [4.0, 'look', { at: [-8.5, 2.2, 2.0], amount: 0.6, blend: 0.4 }],
            [4.6, 'handsTo', { at: [-8.5, 2.45, 2.2], in: 0.3, hold: 0.7, out: 0.4, spread: 0.55 }],
            [4.6, 'look', { at: [-8.5, 2.1, 4.0], amount: 0.6, blend: 0.4 }],
          ],
        },
      },
      notes: 'the front frame (two poles + crossbar) is tipped up as one; the poles and bars ride on the cart bed until they go up',
    },
    'X5-05': {
      staging: 'INSERT 100 mm STATIC, low at the front-left leg: the leg rocks on the uneven setts; the vendor\'s hand slides a flat stone under it (~1.4 s), his other hand tests the pole (it still rocks a little), and a second, thinner stone goes in (~3.1 s). Still.',
      cam: { rig: 'static', pos: [-7.7, 0.5, 6.5], look: [-9.85, 0.24, 4.1], mm: 100, fstop: 4, focus: [-9.85, 0.15, 4.08] },
      set: {
        shadowAt: [-9.85, 0, 4.05], shadowExtent: 4,
        stall: { ...STALL_UP, rock: { amp: 0.03, hz: 1.6, until: 1.6, amp2: 0.012, until2: 3.35 }, stones: [1.25, 2.95] },
      },
      cast: {
        vendor: {
          at: [-10.3, 4.62], face: [-9.85, 4.05], posture: { kneel: 1, bow: 0.55 }, look: [-9.85, 0.1, 4.05], lookAmount: 0.8,
          acts: [
            [0.85, 'reach', { side: 'R', at: [-9.95, 0.08, 4.18], in: 0.4, hold: 0.55, out: 0.35 }],
            [2.1, 'touch', { side: 'L', at: [-9.86, 0.75, 4.08], in: 0.3, hold: 0.6, out: 0.3 }],
            [2.55, 'reach', { side: 'R', at: [-9.95, 0.1, 4.18], in: 0.4, hold: 0.55, out: 0.35 }],
            [3.8, 'touch', { side: 'L', at: [-9.86, 0.75, 4.08], in: 0.3, hold: 0.8, out: 0.3 }],
          ],
        },
      },
    },
    'X5-06': {
      staging: 'MEDIUM 50 mm STATIC from the south-west: the vendor ties the back-left corner of the cloth to its pole (right of frame, arms up); in the foreground the front-left corner hangs lower than the rest, at the height of a passing shoulder.',
      cam: { rig: 'static', pos: [-12.6, 1.6, 8.9], look: [-9.7, 1.65, 3.1], mm: 50, fstop: 5.6, focus: [-9.97, 1.6, 4.2] },
      set: { shadowAt: [-9.5, 0, 3], shadowExtent: 6, stall: { ...STALL_UP, low: LOW } },
      cast: {
        vendor: {
          at: [-10.45, 1.25], face: [-9.97, 1.6], look: [-9.97, 2.45, 1.6], lookAmount: 0.85,
          acts: [
            [0.1, 'handsTo', { at: [-9.9, 2.35, 1.66], in: 0.35, hold: 1.0, out: 0.3, spread: 0.08 }],
            [1.8, 'reach', { side: 'R', at: [-9.92, 2.3, 1.7], in: 0.25, hold: 0.4, out: 0.3 }],
          ],
        },
      },
    },
    'X5-07': {
      staging: 'WIDE 35 mm STATIC from the square, looking north at the stall: two VILLAGERS carry a long ladder on their shoulders across the square left to right (to hang banners); its front end catches the low front-left corner (~1.2 s), drags it a metre and pulls the cloth half off its frame (it falls in a fold, ~2 s). They do not notice and walk on. The vendor, behind the cart with his back to them, does not see it.',
      cam: { rig: 'static', pos: [-7.0, 3.1, 15.5], look: [-8.4, 1.25, 3.6], mm: 35, fstop: 5.6, focus: [-9.5, 1.5, 4.5] },
      set: { shadowAt: [-8, 0, 4], shadowExtent: 12, stall: { ...STALL_UP, low: LOW, snag: { a: 'vilA', b: 'vilB', drag: 1.0 } }, ladder: { a: 'vilA', b: 'vilB' } },
      cast: {
        vilA: { at: [-12.34, LADDER_Z], face: 90, legs: 'planted', look: [6, 1.6, 4.5], lookAmount: 0.4, acts: [[0, 'walk', { to: [3, LADDER_Z], speed: 1.3, acc: 0.05 }], [0, 'reach', { side: 'L', at: 'ladderA', in: 0.01, offset: [0, 0.05, 0] }]] },
        vilB: { at: [-15.54, LADDER_Z], face: 90, legs: 'planted', look: 'vilA.head', lookAmount: 0.3, acts: [[0, 'walk', { to: [-0.2, LADDER_Z], speed: 1.3, acc: 0.05 }], [0, 'reach', { side: 'L', at: 'ladderB', in: 0.01, offset: [0, 0.05, 0] }]] },
        vendor: { at: [-8.3, 0.75], face: 350, posture: { crouch: 0.55 }, look: [-8.4, 0.5, 1.4], lookAmount: 0.6, acts: [[0.6, 'reach', { side: 'R', at: [-8.35, 0.75, 1.5], in: 0.4, hold: 1.2, out: 0.4 }]] },
      },
    },
    'X5-08': {
      staging: 'MEDIUM 50 mm STATIC from the south-west: the vendor stands at the dragged corner watching the two with the ladder go (screen right), then turns and reties the corner without a word (the cloth back on its frame, the corner still hanging low). The first time.',
      cam: { rig: 'static', pos: [-13.0, 1.6, 9.9], look: [-9.6, 1.45, 4.4], mm: 50, fstop: 5.6, focus: [-10.3, 1.5, 4.7] },
      set: { shadowAt: [-9, 0, 4.5], shadowExtent: 9, stall: { ...STALL_UP, low: LOW, off: [[0, 1], [1.9, 1], [2.9, 0]] }, ladder: { a: 'vilA', b: 'vilB' } },
      cast: {
        vendor: {
          at: [-10.5, 4.85], face: 80, look: 'vilB.head', lookAmount: 0.85,
          acts: [
            [1.45, 'turn', { to: 15, dur: 0.6 }],
            [1.45, 'look', { at: [-9.6, 1.4, 4.4], amount: 0.8, blend: 0.4 }],
            [1.9, 'handsTo', { at: 'clothFL', in: 0.35, hold: 1.0, out: 0.35, spread: 0.12 }],
          ],
        },
        vilA: { at: [-2.6, LADDER_Z], face: 90, legs: 'planted', acts: [[0, 'walk', { to: [9, LADDER_Z], speed: 1.3, acc: 0.05 }], [0, 'reach', { side: 'L', at: 'ladderA', in: 0.01, offset: [0, 0.05, 0] }]] },
        vilB: { at: [-5.8, LADDER_Z], face: 90, legs: 'planted', acts: [[0, 'walk', { to: [5.8, LADDER_Z], speed: 1.3, acc: 0.05 }], [0, 'reach', { side: 'L', at: 'ladderB', in: 0.01, offset: [0, 0.05, 0] }]] },
      },
      notes: 'vendor turn: blocking `turn` to heading 15 (toward the corner)',
    },
    'X5-09': {
      staging: 'WIDE 35 mm STATIC from the east side of the square by the music dais, looking west-north-west over the fountain: early life, few and distinct - the fountain running, pigeons on the north roofs (one hops, one pecks), a woman crossing from the alley, the vendor at his stall (cloth corner low). Sound carries the door and the shutter.',
      cam: { rig: 'static', pos: [12.5, 2.2, 9.0], look: [-6.0, 2.8, -5.0], mm: 35, fstop: 8, focus: [-2, 1.5, -2] },
      set: { shadowAt: [-2, 0, 0], shadowExtent: 34, stall: { ...STALL_UP, low: LOW }, birds: [{ perch: 0, yaw: 30, peck: true, hops: [1.3] }, { perch: 1, yaw: -70, hops: [2.4, 2.75] }] },
      cast: {
        walker: { at: [-8.6, -15.5], face: 150, legs: 'planted', look: [0, 1.2, -2], lookAmount: 0.4, acts: [[0, 'walk', { to: [-2.6, -6.4], speed: 1.05 }]] },
        vendor: { at: [-8.7, 0.8], face: 175, look: [-8.5, 0.9, 3.0], lookAmount: 0.6, acts: [[0.8, 'reach', { side: 'R', at: [-8.6, 0.85, 2.4], in: 0.4, hold: 1.0, out: 0.4 }]] },
      },
      deviation: 'the door opening and the shutter thrown back are SOUND only (no animated door / shutter leaf in the set yet); the bird is on the roof',
    },
  },
};
