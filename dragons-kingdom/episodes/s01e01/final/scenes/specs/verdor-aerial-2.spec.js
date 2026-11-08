// Shot specs - VERDOR_AERIAL_2: X4-10 (scene 1C). Session 35: first wiring.
// A SECOND spec on the VERDOR_AERIAL shots (registry VERDOR_AERIAL_2, shotSet VERDOR_AERIAL), as CLING_SQUARE_2 is on
// CLING_SQUARE: its own scene file (verdor-aerial-2.js) and table; builder sets/verdor-aerial-2.js = sets/verdor-aerial.js's
// build() as-is (the SAME MAP, imported from verdor-aerial.spec.js) + a crow's nest on the Santa Maria's mainmast.
// verdor-aerial.spec.js / sets/verdor-aerial.js are not touched (its `plans` X4-10 entry stays as the s30 note).
// MEASURED (s35, gltf probe of the ship model): mainmast at world [267, 1591.15] (ship x -1.15), masthead y 22.66
// (MAP.santaMaria.mastTop 28 is a guess - not used), main top / yard band y 15-18 (yard ends world x 264.5 / 269.5);
// crow's nest floor y 18.3, r 0.85, waist-high wall (top 19.35). Positions: VERDOR frame (+x east, -z north, y up, m).
// CAST: Leaf + abby_ride; the LOOKOUT = crowd08 (adult man, bearded: characters.py), standing in the nest on the mast's
// inland (west) side.
import { MAP } from './verdor-aerial.spec.js';

const MAST = [267, 1591.15];
const NEST_Y = 18.3;
// Leaf: heading south 10 m INLAND of the mast (her wingtips clear the yard ends), ~3 m below the nest so the lookout
// stands above her in the frame; abeam the mast at 0.9 s. DEVIATION: a slowed close pass (7 m/s, the 1C cruise is 16)
// so one 50 mm medium holds Abby and the lookout through the duck, the laugh and the two waves.
const VP = 7, T_ABEAM = 0.9;
const z0 = MAST[1] - VP * T_ABEAM;
const LEAF = { root: [[0, [257, 15, z0]], [7, [257, 15.5, z0 + VP * 7], 'linear']], yawKeys: 180 };
// camera ship AHEAD of her on the inland side (bearing 192 from Abby, 17 m), looking back: her face three-quarter to
// the lens, travel L -> R (she drifts right as she comes on), the mast and the lookout beyond her on the right,
// sliding to the centre / above her head as she leaves it behind
const HEAD = 1.9;                                    // Abby's head over Leaf's root (approx.)
const camAt = (t, dy) => [253.46, 15 + HEAD + 1.4 + dy, z0 + VP * t + 16.63];
const lookAt = (t, dy) => [260, 15 + HEAD + dy, z0 + VP * t];
const SH = (p) => [p[0] - 1.86 * (p[1] - 20), 20, p[2] - 0.394 * (p[1] - 20)];

export default {
  set: 'VERDOR_AERIAL_2',
  map: MAP,
  cast: {
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
    abbyR: { kind: 'human', id: 'abby_ride', ride: 'leaf', outfit: 'abby', role: 'ABBY' },
    lookout: { kind: 'human', id: 'crowd08' },
  },
  shots: {
    'X4-10': {
      staging: 'MEDIUM 50 mm air-to-air past the Santa Maria\'s mainmast: the camera ship flies ahead of Leaf on the inland side, looking back at Abby (left, face three-quarter); Leaf passes close beside the mast (10 m inland of it, just below the crow\'s nest). The LOOKOUT in the nest (beyond her, right) ducks as the wings sweep by, comes back up laughing and waves; Abby waves back with her LEFT hand (no attention drawn to it: a plain wave, her right stays on the grip). Line X4-01 (Abby), said as she turns back to the front.',
      cam: { rig: 'follow', pos: [[0, camAt(0, 0)], [7, camAt(7, 0.5), 'linear']], look: [[0, lookAt(0, 0.8)], [7, lookAt(7, 1.3), 'linear']], mm: 50, fstop: 5.6, focus: 'abbyR.head' },
      set: { shadowAt: [[0, SH([262, 18, z0])], [7, SH([262, 18, z0 + VP * 7]), 'linear']], shadowExtent: 45 },
      cast: {
        leaf: { tack: true, ...LEAF, acts: [[0, 'flight', { corr: 1, hz: 0.9, amp: 0.8 }]] },
        abbyR: { acts: [[0, 'look', { at: 'lookout.head', amount: 0.5 }], [1.2, 'look', { at: 'lookout.head', amount: 0.85, blend: 0.5 }], [3.0, 'wave', { side: 'L', in: 0.35, hold: 1.4, out: 0.4 }], [4.1, 'look', { at: 'leaf.head', amount: 0.6, blend: 0.6 }]] },
        lookout: { at: [MAST[0] - 0.55, MAST[1]], y: NEST_Y, face: 290, look: 'leaf.head', lookAmount: 0.8, acts: [
          [0.95, 'crouch', { to: 0.85, dur: 0.3 }],
          [2.0, 'rise', { dur: 0.5 }],
          [2.1, 'look', { at: 'abbyR.head', amount: 0.85, blend: 0.4 }],
          [2.3, 'nod', { rate: 3.6, amount: 0.1, in: 0.15, hold: 1.3, out: 0.3 }],
          [2.6, 'wave', { side: 'R', in: 0.3, hold: 2.5, out: 0.4 }],
        ] },
      },
      lines: [['X4-01', { at: 4.6 }]],
      deviation: 'a slowed close pass (7 m/s) so one medium holds both; the laugh is a quick head bob (no laugh face in the humans library) + the sound; the crow\'s nest is set dressing (the ship model has none)',
      notes: 'sound: Leaf\'s beats; the lookout\'s laugh ~2.2-3.5 s; Abby X4-01 at 4.6 s (she has turned back to the front: face to the lens)',
    },
  },
};
