// Shot specs - PALACE_CORRIDOR (scene 1A: X1-01, X1-05, X1-06 at first light; X2-04 .. X2-07 in the
// morning). Map: scenes/lib/director/sets/palace-corridor.js (the corridor runs north-south, x -1.5..1.5,
// z 0..26; the chamber door at the NORTH end (z 0), daylight through the arch at the SOUTH end (z 26),
// windows in the EAST wall, lamps on the WEST wall).
// Faces: trackings stay behind or three-quarter behind; the siblings are seen from behind against the
// bright arch (silhouettes) - see `deviation` where that departs from the shot list's camera.

const BOUNDS = [[-1.3, 0.3, 0.35], [1.3, 3.6, 25.4]];

export default {
  set: 'PALACE_CORRIDOR',
  cast: {
    youngAttendant: { kind: 'human', id: 'crowd15', role: 'YOUNG ATTENDANT', armSwing: 1 },
    alexandria: { kind: 'human', id: 'alexandria', role: 'ALEXANDRIA', armSwing: 0.15 },
    abby: { kind: 'human', id: 'abby', role: 'ABBY', armSwing: 1 },
    remi: { kind: 'human', id: 'remi', role: 'REMI', armSwing: 1 },
    servant1: { kind: 'human', id: 'crowd10', role: null, armSwing: 0 },
    servant2: { kind: 'human', id: 'crowd05', role: null, armSwing: 0 },
  },
  homes: { remi: [-0.45, 1.7, 14], abby: [0.45, 1.5, 14] },
  // tools/previs.mjs: the builder's marks (sets/palace-corridor.js, corridor 26 m long)
  previs: { marks: { chamberDoor: [-0.2, 1.4, 0], doorFront: [-0.2, 0, 1.2], exit: [0, 1.6, 26], exitIn: [0, 0, 24.8] } },
  shots: {
    'X1-01': {
      staging: 'BACK + WIDE: followed from behind, small in frame; she hurries out of the chamber door and along the corridor, then breaks into a run.',
      cam: { rig: 'follow', follow: { target: 'youngAttendant', local: false, lag: 0.35, offset: [[0, [0.45, 1.5, -2.3]], [4.5, [0.3, 1.5, -3.4]]], lookOffset: [0, 1.15, 2.5] }, mm: 35, fstop: 2.8, focus: 'youngAttendant', bounds: BOUNDS, shake: { kind: 'handheld', amount: 0.3 } },
      cast: { youngAttendant: { at: [-0.2, 1.7], face: 180, look: 'exit', acts: [[0.1, 'hurry', { to: [0.15, 9.0], speed: 1.75 }], [2.9, 'run', { to: [0.25, 16.5], speed: 2.7 }]] } },
      set: { door: [[0, 0.35], [0.8, 0.35]] },
    },
    'X1-05': {
      staging: 'BACK: tracking alongside, three-quarter behind her right shoulder; the young attendant falls behind.',
      cam: { rig: 'follow', follow: { target: 'alexandria', lag: 0.25, offset: [-1.25, 1.55, -1.6], lookOffset: [0.25, 1.3, 1.8] }, mm: 35, fstop: 2.8, focus: 'alexandria.head', bounds: BOUNDS, shake: { kind: 'handheld', amount: 0.3 } },
      cast: {
        alexandria: { at: [0.2, 17.5], face: 0, look: 'chamberDoor', acts: [[0.0, 'walk', { to: [0.0, 9.0], speed: 1.75, acc: 0.1 }]] },
        youngAttendant: { at: [0.5, 19.6], face: 0, look: 'chamberDoor', acts: [[0.0, 'walk', { to: [0.4, 14.5], speed: 1.25, acc: 0.1 }]] },
      },
    },
    'X1-06': {
      staging: 'BACK: three-quarter behind her; the composure beat is in her shoulders and breath; she goes in.',
      deviation: 'The shot list asks for her face at the door (the composure beat); faces are not approved and lip-sync does not exist yet, so the beat is played on her back and shoulders (a slow exhale, the head settling) as the preview staged its face beats.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.15, 0.25]], ['chamberDoor', [-0.25, 0.1]]], from: 160, height: 1.6, at: 1.0 }, mm: 50, fstop: 2, focus: 'alexandria.head', bounds: BOUNDS },
      cast: { alexandria: { at: [0.05, 3.2], face: 0, look: 'chamberDoor', acts: [[0, 'walk', { to: [-0.1, 1.15], speed: 1.4, stop: 0.6 }], [1.4, 'bow', { to: 0.12, dur: 0.6 }], [2.0, 'rise', { dur: 0.6 }], [2.7, 'walk', { to: [-0.2, -1.4], speed: 1.0 }]] } },
      set: { door: [[0, 0], [2.5, 0], [3.1, 0.75]] },
      exposure: 0.6,
    },
    'X2-04': {
      staging: 'BACK + SIL: from behind, the two of them dark against the daylight at the end of the corridor.',
      deviation: 'The shot list asks for a backward track ahead of them (faces toward the camera); faces are not approved yet, so the camera follows from behind and they walk into the light. Swap back when faces are approved.',
      cam: { rig: 'follow', follow: { target: 'abby', lag: 0.3, offset: [[0, [-0.35, 1.45, -3.0]], [4, [-0.35, 1.45, -3.3]]], lookOffset: [-0.4, 1.25, 4.0] }, mm: 35, fstop: 2.8, focus: 'abby.head', bounds: BOUNDS, shake: { kind: 'handheld', amount: 0.3 } },
      cast: {
        abby: { at: [0.45, 3.5], face: 180, look: 'exit', acts: [[0, 'walk', { to: [0.45, 11.5], speed: 1.75, acc: 0.15 }]] },
        remi: { at: [-0.45, 3.3], face: 180, look: 'exit', acts: [[0, 'walk', { to: [-0.45, 11.3], speed: 1.75, acc: 0.15 }]] },
      },
    },
    'X2-05': {
      staging: 'BACK + WIDE: the servants flatten against the wall; the siblings pass, backs to camera.',
      // session 7: static from the east wall (was a follow from behind, like X2-04 and X2-06 on each side of
      // it: previs --cuts found a jump cut into X2-06, Remi 22 deg apart at 0.91x); the siblings walk past
      // the lens into the depth, the servants on the right (west wall) as the shot list places them
      cam: { rig: 'static', pos: [1.15, 1.4, 9.3], look: [-0.7, 1.2, 16.0], mm: 32, fstop: 2.8, focus: 'remi.head', bounds: BOUNDS },
      cast: {
        abby: { at: [0.45, 11.0], face: 180, look: 'exit', acts: [[0, 'walk', { to: [0.4, 16.0], speed: 1.75, acc: 0.1 }]] },
        remi: { at: [-0.35, 10.8], face: 180, look: 'exit', acts: [[0, 'walk', { to: [-0.3, 15.8], speed: 1.75, acc: 0.1 }], [0.8, 'look', { at: 'servant1.head', amount: 0.4 }]] },
        // eyes lowered as the king's children pass (a servant turning to watch Remi came round full face
        // to the lens in the draft: a sharp, frontal, lit face - against the realism plan)
        servant1: { at: [-1.1, 14.2], face: 100, look: [-0.3, 0.2, 13.6], lookAmount: 0.8, acts: [[0.2, 'carry', {}], [0.2, 'walk', { to: [-1.22, 14.0], speed: 0.4 }]] },
        servant2: { at: [-1.1, 15.1], face: 100, look: [-0.3, 0.2, 14.6], lookAmount: 0.8, acts: [[0.3, 'walk', { to: [-1.22, 15.2], speed: 0.4 }]] },
      },
    },
    'X2-06': {
      staging: 'BACK: a walking two-shot from behind; the teasing carries on the move; mouths unreadable.',
      cam: { rig: 'follow', follow: { target: 'abby', lag: 0.3, offset: [-0.45, 1.5, -2.4], lookOffset: [-0.45, 1.3, 3.0] }, mm: 40, fstop: 2.8, focus: 'abby.head', bounds: BOUNDS, shake: { kind: 'handheld', amount: 0.3 } },
      cast: {
        abby: { at: [0.42, 5.0], face: 180, look: 'exit', acts: [[0, 'walk', { to: [0.42, 21.0], speed: 1.5, acc: 0.1 }], [0.5, 'look', { at: 'remi.head', amount: 0.55 }], [2.2, 'look', { at: 'exit' }], [6.3, 'look', { at: 'remi.head', amount: 0.5 }], [7.5, 'look', { at: 'exit' }]] },
        remi: { at: [-0.42, 4.9], face: 180, look: 'exit', acts: [[0, 'walk', { to: [-0.42, 20.9], speed: 1.5, acc: 0.1 }], [2.6, 'look', { at: 'abby.head', amount: 0.5 }], [5.6, 'look', { at: 'exit' }], [7.9, 'look', { at: 'abby.head', amount: 0.5 }]] },
      },
      lines: [['X2-04', 0.6], ['X2-05', 0.4], ['X2-06', 0.4], ['X2-07', 0.4]],
    },
    'X2-07': {
      staging: 'SIL: at the corridor end, into the light; she shoves his arm without breaking stride; they go out.',
      cam: { rig: 'static', pos: [0.1, 1.45, 18.6], look: [0, 1.3, 26], mm: 35, fstop: 2.8, focus: 'remi.head' },
      cast: {
        abby: { at: [0.4, 18.9], face: 180, look: 'exit', acts: [[0, 'walk', { to: [0.3, 29.5], speed: 1.6, acc: 0.1 }], [0.9, 'shove', { side: 'R', at: 'remi.elbow.L', dur: 0.5, in: 0.2, hold: 0.25, out: 0.3 }]] },
        remi: { at: [-0.4, 19.2], face: 180, look: 'exit', acts: [[0, 'walk', { to: [-0.3, 29.8], speed: 1.6, acc: 0.1 }], [1.2, 'look', { at: 'abby.head', amount: 0.4 }]] },
      },
    },
  },
};
