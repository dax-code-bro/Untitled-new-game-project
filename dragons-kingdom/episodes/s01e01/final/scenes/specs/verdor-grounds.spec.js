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

export default {
  set: 'VERDOR_GROUNDS',
  cast: {
    abby: { kind: 'human', id: 'abby', role: 'ABBY', armSwing: 0.8 },
    remi: { kind: 'human', id: 'remi', role: 'REMI', armSwing: 0.9 },
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
  },
  homes: { leaf: [LEAF_C[0], G + 1.2, LEAF_C[1]], abby: [3.5, G + 1.4, -34] },
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
  },
};
