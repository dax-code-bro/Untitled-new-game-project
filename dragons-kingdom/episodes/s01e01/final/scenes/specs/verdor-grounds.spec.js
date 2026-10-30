// Shot specs - VERDOR_GROUNDS (P-17, and X2-08 .. X2-13 of scene 1A: Abby and Leaf in the morning).
// Map: scenes/lib/director/sets/verdor-grounds.js (VERDOR frame: +x east = the sea side, -z north,
// the field at y ~9). Cameras look NORTH-ish, so the sun over the sea side is screen RIGHT / behind
// (shot list). Leaf waits at LEAF (his platform just east of him); Abby comes up the field from the
// south; Remi walks on past to the north-east (Charcoal stays out of frame until 1B).
// Faces: Abby is seen from behind, in profile against Leaf, or small; her one line ("You'll do.")
// is played over her shoulder. Leaf is a creature: his face is the point of these shots.

const G = 9;                               // field height
const LEAF = [8, -44];                     // where he always waits
const LEAF_C = [6.5, -37.5];               // where he crouches after coming to meet her (X2-08 on)
const leafCrouched = (o = {}) => ({ at: LEAF_C, face: 185, acts: [[0, 'crouch', { k: 1, breathe: 0.5, ...o }]] });

// ---- scene 1B: the launch area (scenes/lib/director/sets/verdor-launch.js builds Charcoal, his access
// rig, the stakes; its marks: rigFoot, climb1..climb11 (the stair, the deck, the gangway), rigDeck,
// deckWest, ropeHandL/R + ropeKeeperL/R (the guide ropes), sideL/R, flankStrap / flankStand (his right
// flank at the girth), neckPalm (the top of his neck ahead of the seat), stakes). He lies with his head
// SOUTH (heading 190), his right flank and the rig toward Leaf's side of the field (west). Cameras that
// look north see Leaf LEFT and Charcoal RIGHT (shot list map), the morning sun (east) raking his back.
const CH = [44, -66];                       // Charcoal's root (near his hips)
const LF = [21.0, -50.0];                   // Leaf for 1B: crouched, facing east toward Charcoal, 2 m behind the stakes
const PLAT1B = [21.0, -52.6, -90];          // his mounting platform, brought alongside his LEFT flank (north: never between him and the cameras)
const ABBY_EQ = [23.15, -48.85];            // Abby at Leaf's right shoulder, fastening his breast strap
const REMI_EQ = [33.5, -52.5];              // Remi with his own gear, inside the stakes south-west of the rig, before the climb
const KEEP_EDGE = [14.0, -70.0];            // the ground keeper at the field's edge, well outside the launch space
const KEEP_R2 = [25.6, -69.4];              // at the edge of the launch space (R2), facing it; the other keeper 1.8 m north of him
const KEEP3_R2 = [25.7, -67.6];
const SET1B = { rig: 'up', platform: PLAT1B, shadowAt: [31, G, -58], shadowExtent: 42 };
const SET1B_DOWN = { ...SET1B, rig: 'down' };
const SET1B_BACK = { ...SET1B, rig: 'back', rigSlide: 4 };
// at rest he is low and level (a half crouch: crouch k 0.5 = verdor-launch.js REST_K); X3-02 lowers him for
// mounting (creatures poses.mount: hind legs folded under the hips; crouch k 1 read as rearing - session 10)
const charRest = (o = {}) => ({ at: CH, face: 190, tack: true, acts: [[0, 'crouch', { k: 0.5, ...o }]] });
const charLow = (o = {}) => ({ at: CH, face: 190, tack: true, acts: [[0, 'mount', { ...o }]] });
// Leaf low and level: crouch k 0.6 (k 1 read as lying flat on the turf in the 1B stills - session 9)
const leafLow = (o = {}) => ({ at: LF, face: 90, tack: true, acts: [[0, 'crouch', { k: 0.6, breathe: 0.5, ...o }]] });
const keeperDown = { armsDown: 1 };          // keeper1's build stands calling (a raised hand): hang the arms

export default {
  set: 'VERDOR_GROUNDS',
  cast: {
    abby: { kind: 'human', id: 'abby', role: 'ABBY', armSwing: 0.8 },
    remi: { kind: 'human', id: 'remi', role: 'REMI', armSwing: 0.9 },
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
    // 1B (verdor-launch.js makes Charcoal and saddles him; the stage adopts him)
    charcoal: { kind: 'creature', id: 'charcoal' },
    remiR: { kind: 'human', id: 'remi_ride', ride: 'charcoal', outfit: 'remi', role: 'REMI' },
    abbyR: { kind: 'human', id: 'abby_ride', ride: 'leaf', outfit: 'abby', role: 'ABBY' },
    keeper: { kind: 'human', id: 'keeper1', role: 'GROUND KEEPER', armSwing: 0.8 },
    keeper2: { kind: 'human', id: 'keeper2', role: 'KEEPER (2)', armSwing: 0.8 },
    keeper3: { kind: 'human', id: 'crowd08', role: 'KEEPER', armSwing: 0.8 },
  },
  homes: { leaf: [LEAF_C[0], G + 1.2, LEAF_C[1]], abby: [3.5, G + 1.4, -34] },
  // tools/previs.mjs: the set builder's marks it cannot compute without the set (printed by verdor-launch.js
  // at setup: "[launch] marks {...}"; Charcoal lowered for mounting (poses.mount) unless noted; re-printed session 10)
  previs: {
    ground: G,
    floors: ['climb', 'deck', 'rigDeck', 'rigGangEnd', 'plat'],
    marks: {
      charcoal: [44, 9.07, -66], rigFoot: [36.58, 8.96, -56.13], rigDeck: [31.39, 14.31, -59.49], rigTower: [31.39, 8.96, -59.49], rigGangEnd: [40.54, 13.61, -57.87],
      climb1: [29.35, 10.74, -57.41], climb2: [28.61, 10.74, -57.54], climb3: [28.72, 10.74, -58.18], climb4: [29.33, 12.53, -61.63], climb5: [29.44, 12.53, -62.27],
      climb6: [30.08, 12.53, -62.15], climb7: [33.47, 14.31, -61.56], climb8: [33.16, 14.31, -60.09], climb9: [33.3, 14.31, -59.15], climb10: [36.75, 14.31, -58.54],
      climb11: [40.39, 13.51, -57.9], deckWest: [29.92, 14.31, -59.75], deckNE: [32.43, 14.31, -60.22],
      ropeHandL: [22.5, 10.01, -58.01], ropeHandR: [23.54, 10.01, -63.92], ropeKeeperL: [21.94, 8.96, -58.01], ropeKeeperR: [23.01, 8.96, -64.11],
      sideL: [30.67, 8.96, -57.13], sideR: [31.52, 8.96, -61.95], seat: [42.61, 14.78, -58.12], charcoalSeat: [42.61, 14.78, -58.12], stakes: [27, 9, -50],
      neckPalm: [42.13, 14.28, -57.14], flankStrap: [39.33, 11.2, -58.7], flankStand: [38.72, 9, -58.8], flankInsert: [41.34, 12.4, -55.68],
      platStairTop: [20.05, 10.45, -47.5], platDeck: [21.1, 10.45, -47.5],
    },
  },
  shots: {
    'P-17': {
      staging: 'NONE: high over the meadow edge; an immense shadow crosses the grass left to right; the dragon is never seen (cut before it is identified).',
      cam: { rig: 'crane', pos: [-158, G + 46, 98], look: [[0, [-150, G, 50]], [4.2, [-150, G, 50]], [7.5, [-134, G, 47]]], mm: 35, fstop: 5.6, focus: 70, ease: 'sine', shake: { kind: 'aerial', amount: 0.12 } },
      set: { area: 'meadow' },
      // the body flies east 70 m up at 22 m/s; with the sun at 32 deg in the east its shadow lies ~108 m
      // west of it and crosses the frame centre at 3.5 s
      reviewAt: 0.47,
      fx: [{ kind: 'shadow-pass', from: 0.8, to: 6.2, params: { object: 'shadowDragon', from: [-101, G + 70, 79], to: [18, G + 70, 79], yawDeg: 90 } }],
      lines: [['L005', 2.6]],
    },
    'X2-08': {
      staging: 'WIDE: low, long lens; Leaf comes low and quick, then crouches; Abby from behind at left; Remi walks on past at right toward something very large off screen.',
      cam: { rig: 'static', pos: [-5.5, G + 0.75, 6], look: [4.5, G + 1.1, -38], mm: 85, fstop: 4, focus: [[0, 'leaf.head'], [2.5, 'leaf.head']] },
      cast: {
        leaf: { at: LEAF, face: 180, acts: [[0, 'stand', { breathe: 0.5 }], [0.6, 'walk', { to: LEAF_C, speed: 3.6, stop: 0.35, blend: 0.4 }], [2.6, 'crouch', { k: 1, breathe: 0.9, blend: 0.8 }]] },
        abby: { at: [-3.2, -14], face: 8, look: 'leaf.head', lookAmount: 0.6, acts: [[0, 'walk', { to: [0.6, -26.8], speed: 1.5, stop: 0.6 }]] },
        // Remi crosses the right of frame, walking on (north-east) out of it toward Charcoal off screen
        remi: { at: [1.0, -17], face: 35, look: 'farField', lookAmount: 0.4, acts: [[0, 'walk', { path: [[9, -27], [18, -38]], speed: 1.7 }]] },
      },
    },
    'X2-09': {
      staging: 'BACK: handheld close beside them; Abby from behind-left checks his wing joint, practised and unhurried.',
      cam: { rig: 'handheld', frame: { subjects: [['abby.head', [-0.4, 0.3]], ['leaf.w_R_2', [0.12, -0.3]]], from: 238, height: G + 1.55, dist: 2.3, at: 1.5 }, mm: 50, fstop: 2.8, focus: 'abby.hand.R', shake: { kind: 'handheld', amount: 0.5 } },
      cast: {
        leaf: leafCrouched({ look: [0.35, 0.05] }),
        abby: { at: [4.2, -35.6], nearTo: { to: 'leaf.w_R_2', dist: 0.62, from: 255 }, look: 'leaf.w_R_2', lookAmount: 0.9, acts: [[0.4, 'handsTo', { at: 'leaf.w_R_2', in: 0.6, spread: 0.12, palm: [1, 0, 0] }]] },
      },
    },
    'X2-10': {
      staging: 'HANDS: her hands at the pad of the wing-knuckle he walks on, his eye beyond (soft, his head turned to watch her); the focus racks to it; he does not flinch.',
      cam: { rig: 'static', frame: { subjects: [['leaf.w_R_2', [-0.15, -0.3]], ['leaf.eye', [0.3, 0.25]]], from: 235, height: G + 0.55, dist: 1.5, at: 1.0 }, mm: 50, fstop: 2.8, focus: [[0, 'leaf.w_R_2'], [2.6, 'leaf.w_R_2'], [3.5, 'leaf.eye']] },
      cast: {
        leaf: leafCrouched({ look: [-0.5, -0.1] }),
        abby: { at: [4.6, -38.4], nearTo: { to: 'leaf.w_R_2', dist: 0.62, from: 215 }, look: 'leaf.w_R_2', posture: { kneel: 1 }, acts: [[0.2, 'handsTo', { at: 'leaf.w_R_2', in: 0.5, spread: 0.1 }], [2.4, 'look', { at: 'leaf.eye', amount: 0.8 }]] },
      },
    },
    'X2-11': {
      staging: 'OTS: over her shoulder to Leaf; she is satisfied (the line plays on her back).',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.45, 0.24]], ['leaf.head', [0.32, 0.0]]], from: 292, height: G + 1.5, dist: 1.7 }, mm: 50, fstop: 2.8, focus: 'leaf.head' },
      cast: {
        leaf: leafCrouched({ look: [-0.3, 0.05] }),
        abby: { at: [4.7, -33.2], nearTo: { to: 'leaf.head', dist: 1.25, from: 262 }, look: 'leaf.eye', lookAmount: 0.8, acts: [[0.5, 'nod', { amount: 0.08, rate: 1.4, in: 0.2, hold: 0.4, out: 0.3 }]] },
      },
      lines: [['X2-08', 0.4]],
      minTail: 0.2,
    },
    'X2-12': {
      staging: 'BACK: from behind her at the riding gear; Leaf noses in over her right shoulder; she pushes his head away; it comes straight back.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.28, 0.2]], ['leaf.head', [0.25, 0.25]]], from: 98, height: G + 1.6, dist: 3.1, at: 0.8 }, mm: 50, fstop: 2.8, focus: 'abby.head' },
      cast: {
        leaf: { root: [[0, [1.3, G, -48.2]], [1.2, [1.3, G, -48.0]], [1.5, [1.5, G, -48.8], 'out'], [2.6, [1.3, G, -48.0]]], yawKeys: [[0, 178], [1.5, 168], [2.6, 180]], acts: [[0, 'stand', { breathe: 0.6, look: [0.1, -0.15] }]] },
        abby: { at: [1.7, -43.6], face: 272, look: 'gear', lookAmount: 0.7, acts: [[1.1, 'shove', { side: 'R', at: 'leaf.head', dur: 0.5, in: 0.15, hold: 0.25, out: 0.35 }], [1.1, 'look', { at: 'leaf.head', amount: 0.4, blend: 0.3 }], [2.2, 'look', { at: 'gear', amount: 0.7 }]] },
      },
    },
    'X2-13': {
      staging: 'PROFILE + DOF: she kneels in front of his head and leans her forehead to his, eyes closed; seen from the side: his eye sharp, her profile soft; he breathes out.',
      // from the south-east, past her: her head in front of his snout's tip (soft, a lost profile), his eye
      // beyond it sharp. She kneels 1.55 m from his skull: at 0.95 (the first render) her head was INSIDE
      // the long snout (it reaches ~0.75 m past the eye) and the side view hid her behind it
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.3, 0.0]], ['leaf.eye', [0.3, 0.08]]], from: 110, height: G + 1.0, dist: 5.0, at: 1.5 }, mm: 85, fstop: 2.0, focus: 'leaf.eye' },
      cast: {
        leaf: leafCrouched({ look: [0.0, -0.15], breathe: 1.0 }),
        abby: { at: [6.4, -32.4], nearTo: { to: 'leaf.head', dist: 1.35, from: 185 }, look: 'leaf.head', lookAmount: 1.0, posture: { kneel: 1 }, acts: [[0.4, 'bow', { to: 0.55, dur: 1.2 }]] },
      },
    },

    // ================================================================== 1B
    '1B-01': {
      staging: 'NONE: Charcoal\'s black hide fills the frame, close enough to read as dark terrain; it rises and falls with his breath (the match cut from the hatchling\'s breathing).',
      cam: { rig: 'static', pos: 'flankInsert', offset: [-5.4, 0.5, 1.0], look: 'flankInsert', mm: 100, fstop: 5.6, focus: 5.5, shake: { kind: 'handheld', amount: 0.08 } },
      set: SET1B,
      cast: { charcoal: charRest({ breathe: 0.12 }) },
    },
    '1B-02': {
      staging: 'BACK: the camera pulls back from his flank (zooming out) until Remi, small, comes into view beside him reaching up for the riding rig\'s band; Remi from behind, the rig\'s stair at left.',
      // from the 1B-01 insert (flankInsert + [-5.4, 0.5, 1.0], 100 mm) back to a wide from the south-west (24 mm);
      // the path stays south of the rig's first flight (z > -55.6)
      cam: { rig: 'dolly', pos: [[0, [34.4, G + 3.9, -53.0]], [1.2, [34.4, G + 3.9, -53.0]], [7.6, [23.5, G + 2.4, -39.5], 'sine']], look: [[0, [39.8, G + 3.4, -54.0]], [1.2, [39.8, G + 3.4, -54.0]], [7.6, [36.0, G + 4.0, -56.0], 'sine']], mm: [[0, 100], [1.2, 100], [7.6, 24, 'sine']], fstop: 5.6, focus: [[0, 5.5], [7.6, 24]] },
      set: SET1B,
      cast: {
        charcoal: charRest(),
        remi: { at: 'flankStand', face: 'flankStrap', look: 'flankStrap', lookAmount: 0.7, legs: 'planted', acts: [[1.8, 'reach', { side: 'R', at: 'flankStrap', in: 0.9, hold: 3.6, out: 0.8 }], [2.0, 'reach', { side: 'L', at: 'flankStrap', offset: [0, -0.25, -0.2], in: 0.8, hold: 2.6, out: 0.8 }]] },
      },
    },
    '1B-03': {
      staging: 'BACK + DOF: medium of Remi from behind his left shoulder, his face turned up to the dragon; Charcoal\'s flank breathing beyond, soft.',
      // (session 9 tried: [36.6, -54.4] at remi.head 50 mm - his face a sharp 3/4; [37.3, -59.8] - inside his folded wing.
      // Kept as authored; the white jaw/lip patch right of Remi is a creatures-track shading defect, filed in PROGRESS)
      cam: { rig: 'static', pos: [37.6, G + 1.7, -54.6], look: [39.8, G + 2.3, -59.2], mm: 40, fstop: 2.8, focus: 'remi.head' },
      set: SET1B,
      cast: {
        charcoal: charRest(),
        remi: { at: 'flankStand', face: 'flankStrap', look: [42, G + 6.5, -57], lookAmount: 0.6, acts: [[0, 'reach', { side: 'R', at: 'flankStrap', in: 0.01, hold: 0.9, out: 0.8 }]] },
      },
    },
    '1B-04': {
      staging: 'WIDE: long lens across the field: Leaf crouched low and level, Abby at his shoulder straightening the breast strap (from behind); Charcoal\'s head enters at the right edge.',
      // session 9: 180 mm on Leaf's mark (at 60 mm Charcoal filled the frame, Leaf a smear at the rig's foot); Charcoal soft beyond
      cam: { rig: 'static', pos: [-13.4, G + 1.8, -0.9], look: [23.0, G + 1.5, -50.3], mm: 180, fstop: 4, focus: 'abby.head' },
      set: SET1B,
      cast: {
        charcoal: charRest(),
        leaf: leafLow({ look: [0.15, 0.05] }),
        abby: { at: ABBY_EQ, face: 5, look: 'leaf.chest', lookAmount: 0.8, acts: [[0.2, 'handsTo', { at: 'leaf.chest', spread: 0.12, in: 0.6, palm: [0, 0, -1] }]] },
      },
    },
    '1B-05': {
      staging: 'BACK: medium past Abby (from behind-left) to Leaf: he turns his head toward a noise and the strap pulls out of her hands; "Leaf. Here." - he turns back; she finishes fastening.',
      cam: { rig: 'static', pos: [20.4, G + 1.6, -45.6], look: [24.3, G + 1.0, -49.8], mm: 40, fstop: 2.8, focus: 'abby.head' },
      set: SET1B,
      cast: {
        leaf: { at: LF, face: 90, tack: true, yawKeys: [[0, 90], [0.6, 90], [1.2, 70, 'sine'], [2.6, 70], [3.4, 90, 'sine']], acts: [[0, 'crouch', { k: 0.6, breathe: 0.5, look: [0.1, 0.05] }], [0.6, 'crouch', { k: 0.6, breathe: 0.6, look: [0.85, 0.2], blend: 0.5 }], [2.7, 'crouch', { k: 0.6, breathe: 0.5, look: [-0.1, 0.0], blend: 0.7 }]] },
        abby: { at: ABBY_EQ, face: 5, look: 'leaf.chest', lookAmount: 0.8, acts: [[0, 'handsTo', { at: 'leaf.chest', spread: 0.12, in: 0.01, hold: 0.9, out: 0.35, palm: [0, 0, -1] }], [1.1, 'look', { at: 'leaf.head', amount: 0.7, blend: 0.4 }], [3.5, 'look', { at: 'leaf.chest', amount: 0.8, blend: 0.4 }], [3.6, 'handsTo', { at: 'leaf.chest', spread: 0.12, in: 0.5, palm: [0, 0, -1] }]] },
      },
      lines: [['L032', 1.45]],
    },
    '1B-06': {
      staging: 'WIDE: the master from the south-west: Abby at Leaf\'s shoulder left, Remi at his gear inside the stakes right, the rig and Charcoal beyond; the lines cross the stakes (11 m); nobody needs to look.',
      deviation: 'The shot list puts Remi in the right foreground; the rig stands between his place and the camera side that keeps Leaf left / Charcoal right, so this is the wide master with both small.',
      cam: { rig: 'static', pos: [16.5, G + 1.75, -36.5], look: [31.0, G + 2.0, -54.0], mm: 28, fstop: 5.6, focus: 16 },
      set: SET1B,
      cast: {
        charcoal: charRest(),
        leaf: leafLow(),
        abby: { at: ABBY_EQ, face: 5, look: 'leaf.chest', acts: [[0, 'handsTo', { at: 'leaf.chest', spread: 0.12, in: 0.01, palm: [0, 0, -1] }], [2.1, 'look', { at: [37.4, G + 1.6, -51.6], amount: 0.5, blend: 0.5 }], [3.4, 'look', { at: 'leaf.chest', amount: 0.8, blend: 0.6 }]] },
        remi: { at: REMI_EQ, face: 285, look: [33, G + 1.0, -50], lookAmount: 0.5, acts: [[0, 'clasp', { in: 0.01 }], [4.8, 'look', { at: [23.2, G + 1.5, -48.8], amount: 0.35, blend: 0.6 }], [6.6, 'look', { at: [33, G + 1.0, -50], amount: 0.5, blend: 0.6 }]] },
      },
      lines: [['L033', 0.7], ['L034', 0.45], ['L035', 0.5], ['L036', 0.45]],
    },
    '1B-07': {
      staging: 'HANDS: insert of Remi\'s hands checking the buckle of his riding belt; his face above the frame.',
      cam: { rig: 'static', pos: [32.3, G + 1.45, -52.2], look: [33.2, G + 1.05, -52.58], mm: 85, fstop: 4, focus: 'remi.hand.R' },
      set: SET1B,
      cast: { charcoal: charRest(), remi: { at: REMI_EQ, face: 285, look: 'remi.hand.R', lookAmount: 0.6, acts: [[0, 'clasp', { in: 0.01 }]] } },
    },
    '1B-08': {
      staging: 'WIDE: the ground keeper far left at the field\'s edge, well outside the launch space, calls it; Charcoal\'s head and shoulder at right.',
      // session 9: the keeper in the left foreground third (~8 m, 35 mm: ~1/3 of frame height; he was a 10 px speck), from behind him; Charcoal's head + shoulder right
      cam: { rig: 'static', pos: [6.0, G + 1.7, -68.0], look: [35.9, G + 2.6, -66.2], mm: 35, fstop: 4, focus: 'keeper.head' },
      set: SET1B,
      cast: { charcoal: charRest(), keeper: { at: KEEP_EDGE, face: 'charcoal', look: [40, G + 4, -58], lookAmount: 0.6 } },
      lines: [['L037', 0.8]],
    },
    '1B-09': {
      staging: 'BACK: Remi from behind raises a hand to the keeper (off left); the stair beyond him.',
      cam: { rig: 'static', pos: [36.2, G + 1.75, -50.4], look: [32.0, G + 1.5, -54.0], mm: 40, fstop: 2.8, focus: 'remi.head' },
      set: SET1B,
      cast: { charcoal: charRest(), remi: { at: REMI_EQ, face: 308, look: [14, G + 1.6, -70], lookAmount: 0.6, acts: [[0.35, 'raiseHand', { side: 'R', in: 0.35, hold: 0.9, out: 0.4 }]] } },
    },
    '1B-10': {
      staging: 'BACK: Abby climbs the mounting platform brought alongside Leaf (standing for it), crosses the deck and swings onto the saddle - the shot ends as she leans over it (cut on the action).',
      deviation: 'No mounted end state in this shot: the seated rider is a separate build (humans library riders), so the mount is shown up to the swing and cut on the action; she is seated from X3-06 on.',
      cam: { rig: 'pan', pos: [28.6, G + 2.1, -56.0], look: [[0, [24.4, G + 1.2, -52.8]], [2.4, [22.4, G + 2.2, -52.6]], [5.6, [21.8, G + 1.9, -51.4], 'sine']], mm: 35, fstop: 4, focus: 'abby.head' },
      set: SET1B,
      cast: {
        leaf: leafLow({ look: [0.2, 0.0] }),
        abby: { at: [24.7, -52.55], face: 270, look: 'leaf.chest', lookAmount: 0.4, legs: 'planted', acts: [[0.2, 'walk', { path: ['platStairTop', [21.3, -52.4], [21.4, -51.75]], speed: 0.85, stop: 0.5 }], [4.3, 'turn', { to: 175, dur: 0.5 }], [4.5, 'reach', { side: 'L', at: 'leaf.chest', offset: [0, 0.6, 0], in: 0.6 }], [4.6, 'bow', { to: 0.55, dur: 1.0 }]] },
      },
    },
    'X3-01': {
      staging: 'WIDE: long lens: Remi crosses to the foot of the access rig; two keepers hold its guide ropes outside the stakes; Charcoal at right.',
      cam: { rig: 'static', pos: [8, G + 1.7, -22], look: [29, G + 3.5, -59], mm: 45, fstop: 5.6, focus: 'remi.head' },
      set: SET1B,
      cast: {
        charcoal: charRest(),
        remi: { at: REMI_EQ, face: 120, legs: 'planted', look: 'rigFoot', lookAmount: 0.4, acts: [[0.2, 'walk', { path: [[35.6, -53.4], 'rigFoot'], speed: 1.3, stop: 0.5 }]] },
        keeper2: { at: 'ropeKeeperL', face: 'rigTower', acts: [[-1, 'handsTo', { at: 'ropeHandL', spread: 0.08 }]] },
        keeper3: { at: 'ropeKeeperR', face: 'rigTower', acts: [[-1, 'handsTo', { at: 'ropeHandR', spread: 0.08 }]] },
      },
    },
    'X3-02': {
      staging: 'NONE: low and wide: Charcoal lowers himself a measured amount, belly toward the turf, wrists braced in front, and holds still; the rig at left.',
      cam: { rig: 'static', pos: [50, G + 0.6, -30], look: [40, G + 4, -58], mm: 30, fstop: 5.6, focus: 'charcoal.head' },
      set: SET1B,
      cast: { charcoal: { at: CH, face: 190, tack: true, acts: [[0, 'crouch', { k: 0.5 }], [0.5, 'mount', { blend: 2.6 }]] } },
    },
    'X3-03': {
      staging: 'BACK: following Remi up the first flight of the stair, from behind and outside the rail; the first turn at the landing.',
      cam: { rig: 'follow', follow: { target: 'remi', lag: 0.3, offset: [0.95, 1.0, -2.6], lookOffset: [0.2, 1.6, 2.5] }, mm: 40, fstop: 4, focus: 'remi.head', shake: { kind: 'handheld', amount: 0.25 } },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remi: { at: [33.2, -56.6], face: 280, legs: 'planted', armSwing: 0.6, acts: [[0, 'walk', { path: ['climb1', 'climb2', 'climb3', [29.1, -59.6]], speed: 1.0, acc: 0.2, stop: 0.6 }]] },
      },
    },
    'X3-04': {
      staging: 'WIDE: from the second landing: Remi comes up into the left of frame and turns for the last flight; Charcoal\'s back and folded wing fill the frame beyond.',
      cam: { rig: 'static', pos: [27.2, G + 6.0, -65.6], look: [38.0, G + 6.0, -58.5], mm: 24, fstop: 5.6, focus: 12 },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remi: { at: [29.3, -60.4], face: 350, legs: 'planted', armSwing: 0.6, acts: [[0, 'walk', { path: ['climb4', 'climb5', 'climb6', [30.9, -61.85]], speed: 0.95, acc: 0.2, stop: 0.6 }]] },
      },
    },
    'X3-05': {
      staging: 'BACK + WIDE: high on the gangway looking down past Remi at the deck rail; the keepers small on the turf below with the guide ropes.',
      cam: { rig: 'static', pos: [33.4, G + 8.5, -58.4], look: [24.0, G + 2.2, -60.8], mm: 24, fstop: 5.6, focus: 4 },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remi: { at: 'deckNE', face: 260, legs: 'planted', look: [23, G + 1, -60.8], lookAmount: 0.7, acts: [[0.3, 'walk', { to: 'deckWest', speed: 0.8 }]] },
        keeper2: { at: 'ropeKeeperL', face: 'rigTower', acts: [[-1, 'handsTo', { at: 'ropeHandL', spread: 0.08 }]] },
        keeper3: { at: 'ropeKeeperR', face: 'rigTower', acts: [[-1, 'handsTo', { at: 'ropeHandR', spread: 0.08 }]] },
      },
    },
    'X3-06': {
      staging: 'WIDE: from the gangway past the ground keeper on the deck (right foreground, from behind): across the stakes Leaf has edged forward with Abby on his back, neck stretched toward Charcoal.',
      deviation: 'The shot list asks for a 135-200 mm lens; Leaf waits ~15 m from the rig (speaking range in 1B-06 and 1B-12), so a 50 mm from the gangway holds him and the keeper.',
      // from the GANGWAY END (was 6 m along it: the deck and its stair stood between the lens and Leaf - the still
      // showed the keeper and grass, Leaf hidden under the deck)
      cam: { rig: 'static', pos: [40.4, G + 6.6, -57.6], look: [26.0, G + 2.0, -52.6], mm: 40, fstop: 4, focus: 'abbyR.head' },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: {},
        keeper: { ...keeperDown, at: [30.3, -57.9], face: 'leaf', look: 'leaf.head', lookAmount: 0.9 },
        leaf: { at: LF, face: 90, tack: true, acts: [[0, 'crouch', { k: 0.6, breathe: 0.5 }], [0.4, 'walk', { to: [23.6, -51.0], speed: 0.8, blend: 0.6 }], [3.6, 'crouch', { k: 0.6, look: [0.0, 0.35], blend: 0.9 }]] },
        abbyR: { look: 'charcoal.head', lookAmount: 0.5 },
      },
    },
    'X3-07': {
      staging: 'OTS: over the ground keeper\'s right shoulder on the deck (he faces away, calling); Abby small on Leaf below, beyond the stakes.',
      // session 9: 1.6 m to the right of the old line, higher (a tower upright of the rig covered Abby from [31.2, -60] and [31.2, -61])
      cam: { rig: 'static', pos: [29.9, G + 8.8, -62.0], look: 'abbyR.head', mm: 60, fstop: 4, focus: 'abbyR.head' },
      // 60 mm (was 35): X3-06 holds Leaf from the same deck - the edit check's jump cut (22 deg, 1.33x); now 2.3x the size
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: {},
        keeper: { ...keeperDown, at: [30.3, -57.9], face: 'leaf', look: 'abbyR.head', lookAmount: 0.9, acts: [[0.5, 'point', { side: 'R', at: [26.4, G + 0.8, -52.0], in: 0.4, hold: 1.4, out: 0.5 }], [4.6, 'raiseHand', { side: 'R', in: 0.35, hold: 1.0, out: 0.4 }]] },
        leaf: { at: [23.6, -51.0], face: 90, tack: true, acts: [[0, 'crouch', { k: 0.6, look: [0.0, 0.35] }]] },
        abbyR: { look: 'leaf.head', lookAmount: 0.6 },   // (was the keeper: her face turned up to the lens, sharp)
      },
      lines: [['X3-01', 0.4], ['X3-02', 0.5], ['X3-03', 0.45]],
    },
    'X3-08': {
      staging: 'WIDE: long lens: Abby turns Leaf back behind the stakes; he goes looking over his shoulder at Charcoal the whole way; Charcoal (right) never looks at him.',
      cam: { rig: 'static', pos: [12, G + 1.8, 25], look: [31, G + 3.5, -55], mm: 60, fstop: 5.6, focus: 75 },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow({ look: [-0.25, -0.05] }),
        remiR: {},
        leaf: { at: [23.6, -51.0], face: 90, tack: true, acts: [[0, 'crouch', { k: 0.6, look: [0.0, 0.3] }], [0.3, 'walk', { path: [[23.0, -49.0], [21.2, -48.6], [18.2, -49.4]], speed: 1.0, blend: 0.5, look: [1.1, 0.15] }]] },
        abbyR: { look: [12, G + 1.5, -50], lookAmount: 0.5 },
      },
    },
    'X3-09': {
      staging: 'BACK: medium from above his back, behind Remi\'s left shoulder: he settles into the riding rig and pulls each strap hard; the keeper on the gangway end beyond, soft.',
      cam: { rig: 'static', pos: [45.2, G + 9.1, -61.3], look: [41.6, G + 6.4, -57.2], mm: 40, fstop: 2.8, focus: 'remiR.head' },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: { look: 'remiR.hand.R', lookAmount: 0.6, acts: [[0.3, 'reach', { side: 'R', at: 'charcoalSeat', offset: [-0.42, -0.12, 0.05], in: 0.4, hold: 0.5, out: 0.3 }], [1.6, 'reach', { side: 'L', at: 'charcoalSeat', offset: [0.42, -0.12, 0.1], in: 0.4, hold: 0.6, out: 0.3 }], [2.9, 'reach', { side: 'R', at: 'charcoalSeat', offset: [-0.4, 0.05, 0.3], in: 0.35, hold: 0.5, out: 0.3 }]] },
        keeper: { ...keeperDown, at: 'climb11', face: 'seat', look: 'remiR.head', lookAmount: 0.7 },
      },
    },
    'X3-10': {
      staging: 'OTS: over the keeper\'s shoulder on the gangway end (his back right) to Remi in the seat in profile: "Straps?" - "Checked twice."',
      cam: { rig: 'static', pos: [38.3, G + 6.8, -59.2], look: [42.5, G + 6.6, -57.8], mm: 40, fstop: 2.8, focus: 'remiR.head' },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: { look: [43, G + 5, -40], lookAmount: 0.5, acts: [[1.3, 'look', { at: 'keeper.head', amount: 0.4, blend: 0.4 }]] },
        keeper: { ...keeperDown, at: 'climb11', face: 'seat', look: 'remiR.head', lookAmount: 0.8 },
      },
      lines: [['X3-04', 0.3], ['X3-05', 0.35]],
    },
    'X3-11': {
      staging: 'HANDS: insert: the keeper\'s hands check the strap at Remi\'s knee once more, quickly and thoroughly.',
      // from behind the seat, up his back (was 1.2 m behind the keeper: his coat filled the 85 mm frame)
      // session 9: from the south-west, ahead of the gangway end (the keeper in profile, his hands at the strap; from behind the seat they were out of frame)
      cam: { rig: 'static', pos: [39.8, G + 6.7, -54.6], look: 'remiR.knee.R', mm: 90, fstop: 4, focus: 'remiR.knee.R' },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: {},
        keeper: { ...keeperDown, at: 'climb11', face: 'seat', look: 'remiR.knee.R', lookAmount: 0.9, acts: [[0.2, 'handsTo', { at: 'remiR.knee.R', spread: 0.1, in: 0.5, hold: 1.4, out: 0.5, palm: [1, 0, 0] }], [0.2, 'bow', { to: 0.4, dur: 0.6 }]] },
      },
    },
    'X3-12': {
      staging: 'BACK: medium from behind Leaf: Abby on his back adjusts a strap with both hands and watches the inspection on Charcoal\'s back across the field with open impatience (the line plays on her back).',
      // over his TAIL (was at x 17.6: inside Leaf's 9 m body, culled - the still showed the rig and no Leaf)
      // (the first still from here: Abby's head at the bottom-right edge, the rig and Charcoal's legs filling the 75 mm frame)
      cam: { rig: 'static', pos: [10.5, G + 3.0, -49.0], look: 'abbyR.head', mm: 55, fstop: 4, focus: 'abbyR.head' },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: {},
        leaf: leafLow({ look: [0.0, 0.1] }),
        abbyR: { look: 'remiR.head', lookAmount: 0.6, acts: [[0.2, 'handsTo', { at: 'leaf.neck', spread: 0.1, offset: [0, 0.2, 0], in: 0.6, hold: 2.0, out: 0.6 }], [3.9, 'handsTo', { at: 'leaf.neck', spread: 0.1, offset: [0, 0.2, 0], in: 0.6, hold: 2.0, out: 0.6 }]] },
      },
      lines: [['X3-06', 2.5]],
    },
    'X3-13': {
      staging: 'NONE: medium of Leaf from his right side: he shifts his weight, agreeing with her tone if not her words; Abby on his back, half out of the top of frame.',
      cam: { rig: 'static', pos: [22.2, G + 1.2, -43.0], look: [22.6, G + 1.1, -50.0], mm: 40, fstop: 4, focus: 'leaf.chest' },
      set: SET1B_DOWN,
      cast: {
        leaf: { at: LF, face: 90, tack: true, acts: [[0, 'crouch', { k: 0.6, breathe: 0.5 }], [0.3, 'crouch', { k: 0.4, look: [-0.2, 0.1], blend: 0.5 }], [1.1, 'crouch', { k: 0.6, look: [0.05, 0.05], blend: 0.6 }]] },
        abbyR: { look: [44, G + 6, -58], lookAmount: 0.5 },
      },
    },
    'X3-14': {
      staging: 'HANDS: close: Remi lays his palm flat on Charcoal\'s neck ahead of the seat ("Morning.", quietly); his arm in from the left, his face out of frame.',
      cam: { rig: 'static', pos: [39.6, G + 6.6, -54.4], look: 'neckPalm', mm: 50, fstop: 2.8, focus: 'neckPalm' },
      set: SET1B_DOWN,
      cast: {
        charcoal: charLow(),
        remiR: { look: 'neckPalm', lookAmount: 0.6, acts: [[0.3, 'touch', { side: 'R', at: 'neckPalm', offset: [0, 0.03, 0], in: 0.8, palm: [0, -1, 0] }]] },
      },
      lines: [['X3-07', 1.5]],
    },
    'X3-15': {
      staging: 'CREATURE: close on Charcoal\'s left eye in the morning sun: it half closes and opens again (an answer).',
      cam: { rig: 'static', pos: [44.9, G + 5.3, -47.2], look: 'charcoal.eye', mm: 85, fstop: 4, focus: 'charcoal.eye' },
      set: SET1B_DOWN,
      cast: { charcoal: { at: CH, face: 190, tack: true, acts: [[0, 'mount', { blink: false, lidClose: 0.05 }], [1.0, 'mount', { blink: false, lidClose: 0.55, blend: 0.8 }], [2.3, 'mount', { blink: false, lidClose: 0.05, blend: 0.7 }]] } },
    },
    'R2-01': {
      staging: 'MEDIUM: the ground keeper at the edge of the launch space takes his clay pipe from his teeth, knocks it out (below frame) and looks down at the turf under his boot; the other keeper beside him. Adults only in frame (Leaf and Abby are behind the camera).',
      // session 9: from behind his right shoulder, into the sun (his face turned away and in shadow; from the east it was a sharp, front-lit 3/4 face)
      cam: { rig: 'static', pos: [22.4, G + 1.7, -70.8], look: [26.2, G + 1.35, -69.0], mm: 50, fstop: 2.8, focus: 'keeper.hand.R' },
      set: SET1B_DOWN,
      cast: {
        keeper: { ...keeperDown, at: KEEP_R2, face: 92, look: [30, G + 1.3, -67], lookAmount: 0.6, holds: { object: 'pipe', hands: 'R', to: 2.8, offset: [0, 0.01, 0] }, acts: [[0, 'reach', { side: 'R', at: 'keeper.head', offset: [0.09, -0.1, 0.03], in: 0.01, hold: 0.9, out: 0.7 }], [1.8, 'look', { at: [27.0, G, -68.9], amount: 0.9, blend: 0.6 }], [1.8, 'bow', { to: 0.35, dur: 0.8 }], [2.9, 'rise', { dur: 1.2 }]] },
        keeper3: { at: KEEP3_R2, face: 95, look: [34, G + 1.2, -66], lookAmount: 0.5 },
      },
      lines: [['R2-01', 3.6]],
    },
    'R2-02': {
      staging: 'MEDIUM: the reverse: the other keeper does not answer - he hears it every morning; his eyes stay on the field.',
      // from the NORTH (was the south-east, 21 deg from R2-01: a jump cut): keeper3 in profile, the ground
      // keeper soft beyond him; Leaf and Abby (west / north-west) stay behind the camera
      // session 9: 85 mm from further back, focused past both (12 m): keeper3's profile soft (it read as a sharp CG face)
      cam: { rig: 'static', pos: [25.3, G + 1.65, -62.0], look: [25.7, G + 1.5, -67.8], mm: 85, fstop: 2.8, focus: 12 },
      set: SET1B_DOWN,
      cast: {
        keeper: { ...keeperDown, at: KEEP_R2, face: 92, look: [30, G + 1.3, -67], lookAmount: 0.6 },
        keeper3: { at: KEEP3_R2, face: 95, look: [34, G + 1.2, -66], lookAmount: 0.5 },
      },
    },
    'X3-16': {
      staging: 'WIDE: the keepers draw the stair back on its runners, well clear of the launch space, its gangway raised; the ground keeper steps away; Charcoal with Remi on his back at right.',
      cam: { rig: 'static', pos: [12.5, G + 2.4, -33.0], look: [33.0, G + 4.6, -58.5], mm: 28, fstop: 5.6, focus: 30 },
      set: { ...SET1B, rig: 'back', rigSlide: [[0.4, 0], [4.4, 4, 'smooth']] },
      cast: {
        charcoal: charLow(),
        remiR: {},
        keeper2: { at: 'sideL', face: 260, legs: 'planted', acts: [[0, 'reach', { side: 'R', at: 'rigPostL', in: 0.3 }], [0.4, 'walk', { to: [26.8, -57.7], speed: 1.33, acc: 1.0, stop: 1.0 }]] },
        keeper3: { at: 'sideR', face: 260, legs: 'planted', acts: [[0, 'reach', { side: 'L', at: 'rigPostR', in: 0.3 }], [0.4, 'walk', { to: [27.6, -62.5], speed: 1.33, acc: 1.0, stop: 1.0 }]] },
        keeper: { ...keeperDown, at: [27.4, -66.0], face: 270, legs: 'planted', acts: [[1.2, 'walk', { to: [22.0, -67.2], speed: 1.1 }]] },
      },
    },
    '1B-12': {
      staging: 'WIDE: long lens, both mounted at very different heights: Abby on Leaf left, Remi high on Charcoal right; speaking range across the stakes, faces too small to read.',
      // session 9: 85 mm (Leaf and Abby were tiny at 60 mm)
      cam: { rig: 'static', pos: [14, G + 1.9, 22], look: [32, G + 3.2, -56], mm: 85, fstop: 5.6, focus: 75 },
      set: SET1B_BACK,
      cast: {
        charcoal: charLow(),
        remiR: { look: 'abbyR.head', lookAmount: 0.4 },
        leaf: leafLow({ look: [-0.2, 0.05] }),
        abbyR: { look: 'remiR.head', lookAmount: 0.5 },
      },
      lines: [['L038', 0.5], ['L039', 0.4], ['L040', 0.4]],
    },
    '1B-13': {
      staging: 'CREATURE: close on Leaf\'s head in profile: his eye on Charcoal (off right), alert to the bigger dragon\'s every movement.',
      cam: { rig: 'static', frame: { subjects: [['leaf.eye', [-0.25, 0.08]]], from: 175, height: G + 1.15, dist: 3.2 }, mm: 85, fstop: 2.8, focus: 'leaf.eye' },
      set: SET1B_BACK,
      cast: { leaf: leafLow({ look: [-0.3, 0.12] }), abbyR: {} },
    },
    '1B-14': {
      staging: 'BACK: close past Abby\'s right shoulder (a lost profile): she rests her hand on Leaf\'s neck and turns his attention forward - "We\'ll go first."',
      cam: { rig: 'static', pos: [21.5, G + 2.05, -48.3], look: [23.8, G + 1.55, -50.1], mm: 60, fstop: 2.8, focus: 'abbyR.head' },
      set: SET1B_BACK,
      cast: {
        leaf: leafLow({ look: [-0.25, 0.08] }),
        abbyR: { look: 'leaf.head', lookAmount: 0.6, acts: [[0.2, 'touch', { side: 'R', at: 'leaf.neck', offset: [0, 0.18, 0], in: 0.6, palm: [0, -1, 0] }]] },
      },
      lines: [['L041', 1.0]],
    },
    '1B-15': {
      staging: 'WIDE: long lens: Leaf rises out of his crouch with Abby on his back, the camera tilting up with him; Charcoal behind him fills the right of the frame - Leaf small beside him, huge beside her.',
      // session 9: low, 200 mm from 66 m: Leaf + Abby readable, Charcoal (94 m) behind him across the right (at 85 mm from 66 m Leaf was a tiny lizard)
      cam: { rig: 'tilt', pos: [-30.0, G + 1.2, -8.0], look: [[0, [26.0, G + 1.7, -50.0]], [1.2, [26.0, G + 1.7, -50.0]], [4.8, [26.0, G + 2.6, -50.3], 'sine']], mm: 200, fstop: 5.6, focus: 'leaf.chest' },
      set: SET1B_BACK,
      cast: {
        charcoal: charLow({ look: [0.1, 0.0] }),
        remiR: {},
        leaf: { at: LF, face: 90, tack: true, acts: [[0, 'crouch', { k: 0.6, breathe: 0.5 }], [1.0, 'stand', { breathe: 0.6, look: [0.0, 0.15], blend: 2.4 }]] },
        abbyR: {},
      },
    },
  },
};
