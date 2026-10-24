// Shot specs - SEA_COAST_DAWN (PROLOGUE: P-02 .. P-07, dawn at sea). Map and objects:
// scenes/lib/director/sets/sea-coast-dawn.js (F1's frame: the camera's home near the origin looking
// NORTH; the island 2 km out to the north-north-east; the dawn sun veiled low in the north).
// Screen direction: the vessel crosses LEFT -> RIGHT (heading ~74 deg) whenever the camera looks north.
// Boat-local frame (actors aboard, camera mounts): +x = bow, -z = PORT (the fog and the sun side),
// +z = starboard, y up from the waterline.
// Under a mount, numeric pos / look are boat-local; { at: [x, y, z] } is a WORLD point.
// Faces: the sailor is anonymous (shot list): small, from behind, or turned away; never a close face.

const SAILOR = [-1.3, 0.35];               // the sailor's working place aboard, by the shrouds (boat-local)
const BOAT_FAR = { at: [40, 260], heading: 74, speed: 2.4 };   // out of view behind the camera

export default {
  set: 'SEA_COAST_DAWN',
  cast: {
    sailor: { kind: 'human', id: 'sailor1', role: null, parent: 'boat', armSwing: 0 },
    steersman: { kind: 'human', id: 'crowd06', role: null, parent: 'boat', armSwing: 0 },
    bowhand: { kind: 'human', id: 'crowd12', role: null, parent: 'boat', armSwing: 0 },
  },
  defaults: {
    set: { boat: BOAT_FAR },
  },
  shots: {
    'P-02': {
      staging: 'NONE: low over the water, the pale sky in the moving swell; fade in from black.',
      trans: ['fadein', 36],
      cam: { rig: 'boat', mount: 'camboat', pos: [0, 0.2, 0], look: [70, -6.5, 0], mm: 24, fstop: 4, focus: 25, shake: { kind: 'vehicle', amount: 0.25, seed: 5 } },
      set: { boat: BOAT_FAR, camBoat: { at: [-20, 120], heading: 8, speed: 1.6, height: 1.0, damp: 0.5 } },
    },
    'P-03': {
      staging: 'WIDE: toward the island in its cloud cap; the vessel crosses the left foreground, small.',
      cam: { rig: 'boat', mount: 'camboat', pos: [0, 0.3, 0], look: { at: [760, 150, -1900] }, mm: 24, fstop: 5.6, focus: 75, shake: { kind: 'vehicle', amount: 0.2, seed: 7 } },
      set: { boat: { at: [-2, -72], heading: 74, speed: 2.2 }, camBoat: { at: [-6, 4], heading: 22, speed: 1.5, height: 2.3, damp: 0.5 } },
      cast: {
        sailor: { at: SAILOR, face: 20, look: null },
        steersman: { at: [-3.85, 0.25], face: 90 },
        bowhand: { at: [3.0, -0.1], face: 80 },
      },
      lines: [['L001', 2.2]],
    },
    'P-04': {
      staging: 'HANDS: a working hand on the rope at the shrouds; no face (100 mm, aboard).',
      cam: { rig: 'boat', mount: 'boat', pos: [-0.85, 1.22, -0.8], look: 'sailor.hand.R', mm: 85, fstop: 5.6, focus: 'sailor.hand.R', shake: { kind: 'vehicle', amount: 0.12, seed: 11 } },
      set: { boat: { at: [-2, -72], heading: 74, speed: 2.2 } },
      cast: { sailor: { at: SAILOR, face: 20, look: 'boat.mast', lookAmount: 0.3 } },
    },
    'P-05': {
      staging: 'BACK: from the stern, the sailor at mid-ship turns to port and up toward the sound above the fog - his face turns away from the lens (lost profile at most).',
      cam: { rig: 'boat', mount: 'boat', pos: [-4.2, 1.75, 0.55], look: [-1.0, 1.55, 0.1], mm: 50, fstop: 2.8, focus: 'sailor.head', shake: { kind: 'vehicle', amount: 0.15, seed: 13 } },
      set: { boat: { at: [4, -76], heading: 74, speed: 2.2 } },
      cast: {
        sailor: { at: SAILOR, face: 60, look: 'boat.mast', lookAmount: 0.3, acts: [[1.1, 'turn', { to: 32, dur: 1.4 }], [1.0, 'look', { at: 'shape', amount: 0.5, blend: 1.0 }]] },
        steersman: { at: [-3.85, 0.25], face: 90 },
      },
    },
    'P-06': {
      staging: 'NONE: low, up into the fog; something vast passes inside the mist - only its shadow in the light shafts and a darkening of the mist; never a dragon.',
      cam: { rig: 'boat', mount: 'camboat', pos: [0, 0.2, 0], look: { at: [-40, 225, -1350] }, mm: 35, fstop: 5.6, focus: 400, shake: { kind: 'vehicle', amount: 0.15, seed: 3 } },
      set: { boat: BOAT_FAR, camBoat: { at: [0, 0], heading: 0, speed: 0.4, height: 1.2, damp: 0.5 }, shape: { at: [40, 185, -1350], drift: -24, opacity: 0.34 } },
      // the darkening has to MOVE to be seen at all: ~150 m across the frame in 6 s (at -9 m/s the
      // draft showed a near-static smudge)
      exposure: -0.6,
    },
    'P-07': {
      staging: 'SIL + BACK: the sailor still, from behind, a dark shape against the bright fog to port.',
      cam: { rig: 'boat', mount: 'boat', pos: [-1.55, 1.62, 2.3], look: [-1.25, 1.5, -12], mm: 50, fstop: 2.8, focus: 'sailor.head', shake: { kind: 'vehicle', amount: 0.12, seed: 17 } },
      set: { boat: { at: [8, -77], heading: 74, speed: 2.2 } },
      cast: { sailor: { at: SAILOR, face: 345, look: 'shape', lookAmount: 1.0 } },
      exposure: -0.2,
    },
  },
};
