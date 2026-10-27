// Shot specs - ALEXANDRIA_ROOM (scene 1A: R1-01, X1-02 .. X1-04, first light). Map:
// scenes/lib/director/sets/alexandria-room.js (room x -2.7..2.7, z -2.5..2.5; the window in the EAST
// wall at z 0.1..1.3 with the jug and the cup on its deep sill; the door in the NORTH wall's east end,
// x 1.0..2.1; the bed against the north wall in the middle).
// Faces: Alexandria is seen from behind (she waits at the window, back to the room) and over her
// shoulder; the young attendant is small, soft (DOF) and backlit by the lamp in the passage.

const BOUNDS = [[-2.45, 0.3, -2.25], [2.45, 3.6, 2.3]];
const WIN = [2.08, 0.65];                  // Alexandria at the window (her root), facing east
const DOORWAY = [1.55, -2.72];             // in the door's reveal

export default {
  set: 'ALEXANDRIA_ROOM',
  cast: {
    alexandria: { kind: 'human', id: 'alexandria', role: 'ALEXANDRIA', armSwing: 0.15 },
    youngAttendant: { kind: 'human', id: 'crowd15', role: 'YOUNG ATTENDANT', armSwing: 0.5 },
  },
  homes: { alexandria: [WIN[0], 1.55, WIN[1]], youngAttendant: [DOORWAY[0], 1.45, DOORWAY[1]] },
  shots: {
    'R1-01': {
      staging: 'NONE: nobody in the room; the jug and the cup on the sill against the grey sea light.',
      cam: { rig: 'static', frame: { subjects: [['cup', [0.16, -0.18]], ['jug', [-0.24, 0.08]]], from: 245, dist: 0.7, rise: 0.32 }, mm: 100, fstop: 4, focus: 'cup' },
      exposure: 0.2,
    },
    'X1-02': {
      staging: 'BACK + WIDE: she is a dark shape against the window, back to the room; the made bed at left.',
      cam: { rig: 'push', frame: { subjects: [['alexandria.head', [0.38, 0.2]], ['bed', [-0.5, -0.42]]], from: 262, height: 1.55 }, mm: 28, fstop: 2.8, focus: 'alexandria.head', push: 0.06, bounds: BOUNDS },
      cast: { alexandria: { at: WIN, face: 90, look: 'windowOut', lookAmount: 0.6, acts: [[2.6, 'look', { at: 'windowOut', amount: 0.8 }]] } },
    },
    'X1-03': {
      staging: 'BACK: from behind her left shoulder (three-quarter back); she turns toward the door (left background), her face away from the camera throughout.',
      // focus on the door she turns toward from the first frame: her head soft in the foreground (sharp, the
      // back of the humans library's bun read as a flat painted disc with a dashed band at this size; session 7:
      // the pull from her head still showed it sharp for the first second)
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.32, 0.22]], ['door', [-0.45, 0.02]]], from: 242, height: 1.6, dist: 1.9, at: 0.4 }, mm: 50, fstop: 2.0, focus: 'door', bounds: BOUNDS },
      // the head leads toward the door from the first frame (her face never turns to the camera); the body follows
      cast: { alexandria: { at: WIN, face: 90, look: 'door', lookAmount: 0.9, acts: [[0.2, 'turn', { to: 'door', dur: 0.75 }]] } },
    },
    'X1-04': {
      staging: 'OTS + DOF: over Alexandria\'s right shoulder (her head very soft in the foreground, face out of frame); the young attendant small and backlit in the doorway, nearly sharp; Alexandria goes to the door.',
      // session 7: focus 2.8 m, just in front of the attendant at 3.7 m (was on Alexandria's head at 1.3 m):
      // her hair sharp read as a painted cap - a flat disc bun, a jagged nape line (humans library,
      // requested); focused on the attendant, her frontal face read CG (previs: blur 0, 'SPEAKING FACE
      // READS'). Here: Alexandria blur 3.9 % of the frame height, the attendant 0.9 % (the audit's 0.6 %)
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.6, 0.2]], ['youngAttendant.head', [-0.25, 0.14]]], from: 158, height: 1.62, dist: 1.35, at: 0.6 }, mm: 50, fstop: 1.8, focus: 2.8, bounds: BOUNDS },
      set: { door: 0.85 },
      cast: {
        alexandria: { at: [1.82, -0.25], face: 'youngAttendant', look: 'youngAttendant.head', acts: [[3.9, 'walk', { to: [1.6, -1.95], speed: 1.2 }]] },
        youngAttendant: { at: DOORWAY, face: 180, look: 'alexandria.head', lookAmount: 0.7, acts: [[0.3, 'bow', { to: 0.18, dur: 0.35 }], [1.2, 'rise', { dur: 0.5 }], [4.1, 'walk', { to: [1.4, -3.6], speed: 0.9, face: 180 }]] },
      },
      lines: [['X1-01', 0.42], ['X1-02', 0.3]],
    },
  },
};
