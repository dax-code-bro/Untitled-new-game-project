// Shot specs - BIRTHING_CHAMBER (TITLE + scene 1A). Read by the set scene (birthing-chamber.js) and
// by scenes/lib/director/tools/build-shots.mjs (shot table, edit list, cue sheets).
//
// Map and marks: scenes/lib/director/sets/birthing-chamber.js (VERDOR frame: +x east, -z north).
// Nest centre (-0.6, 0.3); the egg stands on the linen at (0.62, -0.18); the hatchling comes to rest at
// HR heading west-south-west; Alexandria's stool east of the nest (she sits facing west), the attendant
// north-west of the nest, the door in the WEST wall's north end (left background from the south).
//
// Staging rule while faces and lip-sync are unfinished (shotlist realism_strategy, preview EDL
// `real` codes): every speaking face is soft (DOF), turned away (BACK / lost profile), small (WIDE),
// backlit (SIL) or over the shoulder (OTS). `staging` records the choice per shot.
//
// Screen positions in `frame.subjects` are x, y in -1..1 (left..right, bottom..top).

const ALEX_SEAT = [1.25, -0.14];         // her root when seated on the stool (stool centre 0.13 m behind her, east)
const ALEX_N = [1.2, -1.0];              // standing at the nest's north-east corner
const ATT = [-0.2, -1.25];               // the attendant at the nest's north side
const ATT2 = [-1.0, -1.95];              // the second attendant, behind her
const ABBY_C = [-0.5, 1.72];             // Abby's crouch spot at the nest's south board
const REMI_S = [0.2, 1.9];               // Remi standing behind / beside her
const HR = [0.12, 0.14];                 // the hatchling at rest (heading 242: WSW, F4)
const DOOR_IN = [-2.95, -1.9], DOOR_OUT = [-4.7, -1.9];
const BOUNDS = [[-3.35, 0.25, -2.85], [3.35, 5.2, 2.85]];

const seated = { at: ALEX_SEAT, face: 270, posture: { sit: 1 }, look: 'hatchling.head', lookAmount: 0.6 };
const hatchRest = (o = {}) => ({ at: HR, face: 242, settle: true, acts: [[0, 'lie', { sprawl: 1, breathe: 0.6, lidRelax: 0.45, ...o }]] });
const DUST = { kind: 'dust-motes', id: 'shaft', params: { box: [[-1.6, 0.35, -1.0], [3.3, 4.6, 0.45]], count: 900, size: 0.007, opacity: 0.35 } };
const FLICKER = { kind: 'lamp-flicker', params: { amount: 0.06 } };

export default {
  set: 'BIRTHING_CHAMBER',
  cast: {
    alexandria: { kind: 'human', id: 'alexandria', role: 'ALEXANDRIA', armSwing: 0 },
    attendant: { kind: 'human', id: 'attendant', role: 'ATTENDANT', armSwing: 0.3 },
    attendant2: { kind: 'human', id: 'crowd06', role: null, armSwing: 0 },
    youngAttendant: { kind: 'human', id: 'crowd15', role: 'YOUNG ATTENDANT', armSwing: 0.6 },
    abby: { kind: 'human', id: 'abby', role: 'ABBY' },
    remi: { kind: 'human', id: 'remi', role: 'REMI' },
    hatchling: { kind: 'creature', id: 'hatchling', quality: 'standard' },
  },
  // where each actor usually is (eye-lines and facings toward someone who is not in the shot)
  homes: { hatchling: [HR[0], 0.46, HR[1]], alexandria: [ALEX_SEAT[0], 1.2, ALEX_SEAT[1]], attendant: [ATT[0], 1.4, ATT[1]], abby: [ABBY_C[0], 1.0, ABBY_C[1]], remi: [REMI_S[0], 1.7, REMI_S[1]] },
  defaults: {
    set: { egg: 'opened' },
    fx: [FLICKER],
  },
  shots: {
    // ------------------------------------------------------------------ TITLE
    'T-01': {
      staging: 'NONE: no people. Near dark: only the key lamp; the title over the dark shell.',
      cam: { rig: 'push', frame: { subjects: [['eggTop', [0.3, 0.12]]], from: 128, dist: 2.3, rise: 0.12 }, mm: 85, fstop: 2.8, focus: 'egg', focusOffset: -0.2, push: 0.08, bounds: BOUNDS },
      set: { egg: 'closed', onlyKeyLamp: true, dust: 0.3, titleLamp: { at: [0.12, 0.98, -0.62], intensity: 0.9 } },
      captions: [{ text: "DRAGON'S KINGDOM", from: 1.0, to: 6.2, style: 'title' }],
      exposure: 0.6,
    },
    // ------------------------------------------------------------------- 1A
    '1A-01': {
      staging: 'NONE: macro on the shell; the crack runs on from the old fracture and stops.',
      cam: { rig: 'static', frame: { subjects: [['eggCrack', [0.1, 0.05]]], from: 150, dist: 0.62, rise: 0.06 }, mm: 100, fstop: 8 },
      set: { egg: 'closed', crack: [[0, 0.3], [1.5, 0.3], [2.4, 1.0, 'out']] },
      exposure: -0.4,
    },
    '1A-02': {
      staging: 'WIDE: the attendant small, turned to the nest.',
      cam: { rig: 'tilt', pos: [0.3, 1.75, 2.8], look: [[0, [2.4, 3.8, -0.45]], [1.0, [2.4, 3.8, -0.45]], [5.2, [-0.6, 0.75, -0.4]]], mm: 24, fstop: 2.8, focus: 'nest' },
      cast: { attendant: { at: ATT, face: 'egg', look: 'egg', acts: [[3.6, 'gesture', { side: 'both', dur: 2.2 }]] } },
      set: { egg: 'closed', crack: 1 },
      fx: [FLICKER, DUST],
    },
    '1A-03': {
      staging: 'BACK + SIL: the attendant from behind (soft), Alexandria a dark shape in the bright doorway; the raised hand reads as a shape.',
      cam: { rig: 'static', frame: { subjects: [['attendant.head', [-0.6, 0.12]], ['doorway', [0.22, -0.55]]], from: 120, height: 1.5, at: 3.0 }, mm: 40, fstop: 2.8, focus: 'door', bounds: BOUNDS },
      cast: {
        attendant: { at: ATT, face: 'egg', look: 'egg', acts: [[0.3, 'look', { at: 'door', amount: 0.9 }], [2.8, 'bow', { to: 0.35, dur: 0.5 }], [3.3, 'rise', { dur: 0.6 }], [4.1, 'look', { at: 'egg' }]] },
        alexandria: { at: DOOR_OUT, face: 90, acts: [[1.0, 'walk', { to: [-2.95, -1.55], speed: 1.05, face: 'egg' }], [3.3, 'raiseHand', { side: 'R', in: 0.3, hold: 0.9, out: 0.4 }], [4.1, 'look', { at: 'egg' }]] },
      },
      set: { door: [[0.5, 0], [1.3, 0.85]], egg: 'closed', crack: 1 },
    },
    '1A-04': {
      staging: 'DOF: the egg sharp in the foreground; both women soft behind it at either side (mouths unreadable).',
      cam: { rig: 'push', frame: { subjects: [['egg', [0.05, -0.38]], ['attendant.head', [-0.55, 0.32]], ['alexandria.head', [0.52, 0.32]]], from: 178, height: 1.05 }, mm: 35, fstop: 1.8, focus: 'egg', push: 0.05, bounds: BOUNDS },
      set: { egg: 'closed', crack: 1 },
      cast: {
        attendant: { at: ATT, face: 'egg', look: 'egg' },
        alexandria: { at: ALEX_N, face: 'egg', look: 'egg', acts: [[7.1, 'walk', { to: [1.32, -0.55], speed: 0.6, face: 'egg' }]] },
      },
      lines: [['L006', 0.6], ['L007', 0.4], ['L008', 0.35], ['L009', 0.4]],
    },
    '1A-05': {
      staging: 'BACK: from behind Alexandria; she sits on the stool beside the nest and does not reach in.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.2, 0.3]], ['egg', [-0.3, -0.25]]], from: 82, height: 1.45, at: 0.6 }, mm: 40, fstop: 2.8, focus: 'alexandria.head', bounds: BOUNDS },
      cast: { alexandria: { at: [1.3, -0.95], face: 'egg', look: 'egg', acts: [[0.3, 'walk', { to: ALEX_SEAT, speed: 0.75, face: 270 }], [1.9, 'sit', { dur: 1.1 }]] } },
      set: { egg: 'closed', crack: 1 },
    },
    '1A-06': {
      staging: 'NONE: macro; another piece of shell shifts.',
      cam: { rig: 'static', frame: { subjects: [['eggFrag', [0.0, 0.0]]], from: 128, dist: 0.6, rise: 0.04 }, mm: 100, fstop: 8 },
      set: { egg: 'cracked', crack: 1, frag: { shift: [[0.8, 0], [1.05, 0.07], [1.4, 0.05]] } },
      exposure: -0.4,
    },
    '1A-07': {
      staging: 'NONE: macro; the shell flexes outward under pressure (birth stage 1).',
      cam: { rig: 'static', frame: { subjects: [['eggFrag', [-0.1, 0.05]]], from: 140, dist: 0.55, rise: 0.0 }, mm: 100, fstop: 8 },
      set: { egg: 'cracked', crack: 1, frag: { shift: 0.05, push: [[0.5, 0], [1.8, 0.005], [2.5, 0.002], [3.3, 0]] } },
      exposure: -0.4,
    },
    '1A-08': {
      staging: 'NONE: macro, a different angle; a fragment lifts away (birth stage 2).',
      cam: { rig: 'static', frame: { subjects: [['eggFrag', [0.15, 0.0]]], from: 100, dist: 0.85, rise: 0.12 }, mm: 100, fstop: 8 },
      set: { egg: 'cracked', crack: 1, frag: { shift: 0.05, lift: [[0.6, 0], [1.9, 1]] } },
      exposure: -0.3,
    },
    '1A-09': {
      staging: 'NONE: close; a small gold snout presses into the opening (birth stage 3); gold catches the lamplight, no glow.',
      cam: { rig: 'push', frame: { subjects: [['eggTop', [0.0, -0.05]]], from: 160, dist: 1.05, rise: 0.08 }, mm: 85, fstop: 5.6, focus: 'eggTop', push: 0.08 },
      cast: { hatchling: { at: [0.7, -0.22], face: 242, pitch: -70, anchor: { part: 'head', to: 'eggTop', offset: [[0, [0, -0.2, 0]], [0.8, [0, -0.2, 0]], [2.6, [-0.015, -0.11, 0.008]]] }, acts: [[0, 'lie', { sprawl: 1, raise: 0.4, headDown: -0.3, breathe: 0.7, lidRelax: 0.6 }]] } },
      set: { egg: 'opened' },
    },
    '1A-10': {
      staging: 'NONE: close; the shape stills (birth stage 4); one tiny breath moves the shell edge.',
      cam: { rig: 'static', frame: { subjects: [['eggTop', [0.05, 0.0]]], from: 140, dist: 0.95, rise: 0.06 }, mm: 85, fstop: 5.6, focus: 'eggTop' },
      cast: { hatchling: { at: [0.7, -0.22], face: 242, pitch: -70, anchor: { part: 'head', to: 'eggTop', offset: [-0.015, -0.11, 0.008] }, acts: [[0, 'lie', { sprawl: 1, raise: 0.4, headDown: -0.3, breathe: 0.25, lidRelax: 0.8 }]] } },
      set: { egg: 'opened' },
    },
    '1A-11': {
      staging: 'SIL + HANDS: the two attendants as dark shapes against the cool shaft; the clasped hands carry it.',
      cam: { rig: 'static', frame: { subjects: [['attendant.head', [0.05, 0.3]], ['attendant2.head', [-0.5, 0.32]]], from: 250, height: 1.4 }, mm: 50, fstop: 2, focus: 'attendant.chest', bounds: BOUNDS },
      cast: {
        attendant: { at: ATT, face: 'egg', look: 'egg', acts: [[0.2, 'clasp', {}]] },
        attendant2: { at: ATT2, face: 'egg', look: 'egg' },
      },
      fx: [FLICKER, DUST],
    },
    '1A-12': {
      staging: 'NONE: the hatchling emerges awkwardly - wet, unsteady, exhausted; no glow. (Kinematic: pose blends along a path over the rim; no soft-body shell.)',
      cam: { rig: 'push', frame: { subjects: [['hatchling.head', [-0.15, 0.05]], ['egg', [0.4, 0.25]]], from: 186, height: 0.78, at: 6.0 }, mm: 50, fstop: 2.8, focus: 'hatchling.eye', push: [[0, 0.12], [9, 0.0]], bounds: BOUNDS },
      cast: {
        hatchling: {
          at: [0.7, -0.22], face: 242, pitch: [[0, -70], [2.4, -35], [5.4, 0]], settle: { lift: true },
          anchor: { part: 'head', to: [[0, 'eggTop'], [2.4, [0.42, 1.02, -0.02]], [5.4, [-0.24, 0.62, 0.36]]], offset: [[0, [-0.015, -0.11, 0.008]], [2.4, [0, 0, 0]]] },
          acts: [[0, 'pushUp', { k: 0.3, tremble: 0.8, breathe: 0.7 }], [2.6, 'struggle', { period: 3.2, blend: 1.2 }], [6.4, 'lie', { sprawl: 1, breathe: 0.75, lidRelax: 0.5, blend: 1.0 }]],
        },
      },
      set: { egg: 'opened', eggRock: true },
    },
    '1A-13': {
      staging: 'OTS + BACK: over the attendant\'s left shoulder; she speaks turned away from camera.',
      cam: { rig: 'static', frame: { subjects: [['attendant.head', [-0.6, 0.42]], ['hatchling', [0.18, -0.35]]], from: 12, height: 1.75 }, mm: 50, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
      cast: { attendant: { at: ATT, face: 'hatchling', look: 'hatchling' }, hatchling: hatchRest() },
      lines: [['L010', 0.6]],
    },
    '1A-14': {
      staging: 'OTS + DOF: over Alexandria\'s right shoulder, veil and cheek soft; the softening carried by posture and breath (face close-up waits for approved faces).',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.62, 0.42]], ['hatchling.head', [-0.15, -0.3]]], from: 45, height: 1.3, at: 1.6 }, mm: 65, fstop: 2, focus: 'hatchling.head', bounds: BOUNDS },
      cast: { alexandria: { ...seated, acts: [[0.3, 'lean', { to: 0.65, dur: 1.4 }]] }, hatchling: hatchRest() },
    },
    '1A-15': {
      staging: 'BACK + SIL: her lost profile from behind-right, rim-lit by the shaft; the cheek line hides the lips. Hold after the line.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.12, 0.22]]], from: 66, dist: 1.25, rise: 0.02 }, mm: 65, fstop: 2, focus: 'alexandria.head', bounds: BOUNDS },
      cast: { alexandria: { ...seated, posture: { sit: 1, lean: 0.65 } }, hatchling: hatchRest() },
      lines: [['L011', 0.9]],
      minTail: 2.5,
    },
    '1A-16': {
      staging: 'DOF: focus on the lamp in the foreground; she is a soft shape behind its bokeh.',
      cam: { rig: 'static', frame: { subjects: [['lampKey', [-0.3, -0.45]], ['attendant.head', [0.12, 0.3]]], from: 172, height: 0.62, dist: 0.75 }, mm: 50, fstop: 2, focus: 'lampKey', bounds: BOUNDS },
      cast: { attendant: { at: ATT, face: 'hatchling', look: 'hatchling', lookAmount: 0.5, acts: [[0.3, 'look', { at: 'hatchling', amount: 0.3 }]] } },
    },
    '1A-17': {
      staging: 'HANDS: style frame F4\'s framing - the hatchling slips against the broken shell; Alexandria\'s hands come in from screen right with a folded cloth; her face out of frame.',
      cam: { rig: 'static', frame: { subjects: [['hatchling.head', [-0.3, 0.05]], ['hatchling.hips', [0.3, -0.05]]], from: 176, height: 0.68, at: 3 }, mm: 50, fstop: 2.8, focus: 'hatchling.eye', bounds: BOUNDS },
      cast: {
        hatchling: { at: HR, face: 242, settle: true, acts: [[0, 'struggle', { period: 4.2, k: 0.9 }], [3.6, 'pushUp', { k: 0.25, tremble: 0.4, blend: 1.0 }]] },
        alexandria: { ...seated, at: [0.95, 0.12], posture: { sit: 1, lean: 0.85 }, acts: [[2.2, 'handsTo', { at: 'hatchling.chest', offset: [0.08, -0.02, 0.1], palm: [0, 1, 0], in: 0.8, spread: 0.07 }]] },
      },
      set: { egg: 'opened', foldInHands: true },
    },
    '1A-18': {
      staging: 'SIL + WIDE: from the nest toward the door; Abby and Remi two backlit shapes in the bright doorway (reverse angle, declared).',
      cam: { rig: 'static', pos: [-0.95, 1.4, -0.35], look: [-3.6, 1.25, -1.95], mm: 35, fstop: 2.8, focus: 'door' },
      exposure: -1.6,
      set: { door: [[0.2, 0], [0.8, 0.85]], lamps: 0.35, passage: 2.2 },
      cast: {
        abby: { at: [-4.55, -1.95], face: 90, look: 'egg', acts: [[0.4, 'walk', { to: [-3.85, -1.95], speed: 0.9 }], [1.0, 'bow', { to: 0.25, dur: 0.4 }]] },
        remi: { at: [-4.7, -1.55], face: 90, look: 'egg', acts: [[0.7, 'walk', { to: [-4.15, -1.6], speed: 0.8 }]] },
      },
      lines: [['L012', 1.25]],
    },
    '1A-19': {
      staging: 'BACK: from behind Alexandria; her back shows she does not look away.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.35, 0.42]], ['hatchling', [-0.25, -0.3]]], from: 84, height: 1.4 }, mm: 50, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
      cast: { alexandria: seated, hatchling: hatchRest() },
      lines: [['L013', 0.3]],
    },
    '1A-20': {
      staging: 'WIDE: high in the corner; everyone small.',
      cam: { rig: 'static', pos: [3.1, 3.3, 2.6], look: [-1.5, 0.6, -0.5], mm: 24, fstop: 2.8, focus: 'nest' },
      cast: {
        abby: { at: [-2.75, -1.55], face: 'nest', look: 'hatchling', acts: [[0.2, 'walk', { to: [-2.3, -0.75], speed: 1.7, stop: 0.25 }], [1.05, 'walk', { path: [[-2.1, 0.1], [-1.75, 0.95]], speed: 0.55, face: 'hatchling' }]] },
        remi: { at: [-3.05, -1.85], face: 'nest', look: 'egg', acts: [[0.9, 'walk', { to: [-2.65, -0.95], speed: 0.8 }], [3.0, 'look', { at: 'hatchling' }]] },
        alexandria: seated, hatchling: hatchRest(),
      },
    },
    '1A-21': {
      staging: 'BACK: two backs over the nest; Alexandria soft beyond.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.3, 0.3]], ['remi.head', [0.3, 0.42]]], from: 185, height: 1.55 }, mm: 40, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
      cast: {
        abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling' }, remi: { at: REMI_S, face: 'hatchling', look: 'hatchling' },
        alexandria: seated, hatchling: hatchRest(),
      },
      lines: [['L014', 0.8], ['L015', 0.3], ['L016', 0.3]],
    },
    '1A-22': {
      staging: 'DOF + HANDS: her face far out of focus behind the sharp hatchling; the almost-touch is her hand.',
      cam: { rig: 'static', frame: { subjects: [['hatchling.head', [0.42, -0.05]], ['abby.head', [-0.35, 0.25]]], from: 320, height: 0.62, at: 2.0 }, mm: 65, fstop: 2, focus: 'hatchling.eye', bounds: BOUNDS },
      cast: {
        abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', acts: [[0.3, 'crouch', { dur: 0.9 }], [2.4, 'reach', { side: 'R', at: 'hatchling.head', offset: [-0.05, 0.08, 0.25], in: 0.6, hold: 0.7, out: 0.5 }], [3.6, 'look', { at: 'alexandria.head' }]] },
        hatchling: { at: HR, face: 242, acts: [[0, 'lie', { sprawl: 1, breathe: 0.6, look: [0, 0] }], [1.3, 'lie', { sprawl: 1, breathe: 0.6, look: [0.45, 0.12], blend: 0.8 }]] },
      },
    },
    '1A-23': {
      staging: 'OTS + DOF + SIL: over Abby\'s crouched shoulder (soft) to Alexandria, soft and backlit; focus on the hatchling between them.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.6, 0.1]], ['alexandria.head', [0.5, 0.32]], ['hatchling.head', [-0.05, -0.35]]], from: 180, height: 0.95 }, mm: 40, fstop: 2, focus: 'hatchling.head', bounds: BOUNDS },
      cast: { abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 } }, alexandria: seated, hatchling: hatchRest() },
      lines: [['L017', 0.4]],
    },
    '1A-24': {
      staging: 'BACK + DOF: Remi from behind (soft); the attendant across the nest, soft.',
      cam: { rig: 'static', frame: { subjects: [['remi.head', [-0.55, 0.35]], ['attendant.head', [0.3, 0.3]]], from: 160, height: 1.75 }, mm: 40, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
      cast: {
        remi: { at: REMI_S, face: 'hatchling', look: 'hatchling' }, attendant: { at: ATT, face: 'hatchling', look: 'remi.head', lookAmount: 0.5 },
        abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 } }, hatchling: hatchRest(),
      },
      lines: [['L018', 0.6], ['L019', 0.45]],
    },
    '1A-25': {
      staging: 'OTS: her fear is her stillness and the held breath; the face stays out of frame.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.65, 0.15]], ['hatchling.head', [0.15, -0.2]]], from: 205, height: 0.9 }, mm: 65, fstop: 2, focus: 'hatchling.head', bounds: BOUNDS },
      cast: { abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 } }, hatchling: hatchRest({ breathe: 0.05, lidRelax: 0.9 }) },
    },
    '1A-26': {
      staging: 'NONE: insert, the hatchling\'s side rises.',
      cam: { rig: 'static', frame: { subjects: [['hatchling.chest', [0.0, 0.0]]], from: 168, dist: 0.85, rise: 0.12 }, mm: 100, fstop: 8, focus: 'hatchling.chest', focusOffset: -0.06 },
      cast: { hatchling: hatchRest({ breathe: 0.45 }) },
    },
    '1A-27': {
      staging: 'BACK + DOF: from behind Abby (soft) to Alexandria (soft); the hatchling sharp between.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.6, 0.2]], ['alexandria.head', [0.55, 0.35]], ['hatchling.head', [0.0, -0.32]]], from: 182, height: 1.0 }, mm: 40, fstop: 2, focus: 'hatchling.head', bounds: BOUNDS },
      cast: { abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 } }, alexandria: seated, hatchling: hatchRest() },
      lines: [['L020', 0.45], ['L021', 0.45]],
      minTail: 0.8,
    },
    '1A-28': {
      staging: 'WIDE: high three-shot; faces a few pixels across.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.45, -0.05]], ['alexandria.head', [0.5, 0.05]], ['hatchling', [0.0, -0.4]]], from: 195, height: 2.7 }, mm: 28, fstop: 2.8, focus: 'hatchling', bounds: BOUNDS },
      cast: {
        abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 } }, remi: { at: REMI_S, face: 'hatchling', look: 'hatchling', acts: [[0.4, 'look', { at: 'alexandria.head' }]] },
        alexandria: { ...seated, acts: [[1.6, 'look', { at: 'remi.head', amount: 0.4 }], [3.0, 'look', { at: 'hatchling.head' }]] }, hatchling: hatchRest(),
      },
      lines: [['L022', 0.5], ['L023', 0.35], ['L024', 0.3]],
    },
    '1A-29': {
      staging: 'BACK: the sideways look reads as a head turn from behind.',
      cam: { rig: 'static', frame: { subjects: [['abby.head', [-0.3, 0.12]], ['remi.head', [0.32, 0.42]]], from: 186, height: 1.5 }, mm: 40, fstop: 2, focus: 'remi.head', bounds: BOUNDS },
      cast: {
        abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 } },
        remi: { at: REMI_S, face: 'hatchling', look: 'hatchling', acts: [[0.2, 'look', { at: 'abby.head', amount: 0.9 }], [2.4, 'look', { at: 'hatchling' }]] },
        hatchling: hatchRest(),
      },
      lines: [['L025', 1.4]],
    },
    '1A-30': {
      staging: 'BACK + WIDE: from behind Alexandria (soft) across the nest to the children, small.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.62, 0.32]], ['abby.head', [-0.28, 0.0]]], from: 72, height: 1.4 }, mm: 50, fstop: 1.8, focus: 'alexandria.head', bounds: BOUNDS },
      cast: {
        alexandria: seated,
        abby: { at: ABBY_C, face: 'hatchling', look: 'hatchling', posture: { crouch: 1 }, acts: [[2.7, 'rise', { dur: 1.2 }]] },
        remi: { at: REMI_S, face: 'hatchling', look: 'hatchling', acts: [[3.9, 'turn', { to: 'door', dur: 0.9 }], [3.9, 'look', { at: 'door' }]] },
        hatchling: hatchRest(),
      },
      lines: [['L026', 0.6]],
    },
    '1A-31': {
      staging: 'BACK + WIDE: walking away; the lines carry across the room.',
      cam: { rig: 'static', pos: [2.7, 1.65, 0.75], look: [-3.0, 1.1, -1.55], mm: 28, fstop: 2.8, focus: 'abby.head' },
      cast: {
        alexandria: { ...seated, acts: [[3.0, 'look', { at: 'abby.head', amount: 0.5 }], [6.5, 'look', { at: 'hatchling.head' }]] },
        abby: { at: [-0.55, 1.85], face: 'door', look: 'door', acts: [[0.3, 'walk', { path: [[-1.95, 1.95], [-2.6, 0.35], [-2.95, -1.45]], speed: 0.85 }]] },
        remi: { at: [0.15, 1.95], face: 'door', look: 'door', acts: [[0.0, 'walk', { path: [[-1.55, 2.1], [-2.35, 0.55], [-2.75, -1.15]], speed: 0.9 }], [3.4, 'look', { at: 'alexandria.head', amount: 0.6 }]] },
        hatchling: hatchRest(),
      },
      lines: [['L027', 0.5], ['L028', 0.35], ['L029', 0.3], ['L030', 0.35], ['L031', 0.35]],
    },
    '1A-32': {
      staging: 'SIL: two silhouettes in the bright doorway; Abby looks back once (reverse angle toward the door, declared).',
      cam: { rig: 'static', pos: [-0.95, 1.4, -0.35], look: [-3.6, 1.25, -1.95], mm: 35, fstop: 2.8, focus: 'door' },
      exposure: -1.3,
      cast: {
        abby: { at: [-3.05, -1.95], face: 270, look: null, acts: [[0.5, 'look', { at: 'hatchling', amount: 1 }], [1.7, 'look', { at: 'doorOut', amount: 0.4 }], [2.0, 'walk', { to: [-4.7, -1.95], speed: 1.0 }]] },
        remi: { at: [-3.55, -1.65], face: 270, acts: [[1.6, 'walk', { to: [-4.8, -1.6], speed: 1.0 }]] },
      },
      set: { door: [[0, 0.85], [3.0, 0.85], [3.8, 0.0]], lamps: 0.4, passage: 2.2 },
    },
    '1A-33': {
      staging: 'BACK + HANDS: her hand (sharp) rests near the newborn without restraining it.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.hand.R', [0.22, 0.05]], ['hatchling.head', [-0.35, -0.2]]], from: 205, height: 0.75, at: 3.0 }, mm: 65, fstop: 4, focus: 'alexandria.hand.R', bounds: BOUNDS },
      cast: {
        alexandria: { ...seated, posture: { sit: 1, lean: 0.8 }, acts: [[1.6, 'reach', { side: 'R', at: 'hatchling.chest', offset: [0.08, 0.0, 0.12], in: 1.0 }]] },
        hatchling: hatchRest(),
      },
    },
    '1A-34': {
      staging: 'NONE: insert, the tiny rise of its side (the match-cut source).',
      cam: { rig: 'static', frame: { subjects: [['hatchling.chest', [0.05, 0.0]]], from: 195, dist: 0.85, rise: 0.12 }, mm: 100, fstop: 8, focus: 'hatchling.chest', focusOffset: -0.06 },
      cast: { hatchling: hatchRest({ breathe: 0.5 }) },
    },
    // ------------------------------------------------------------- X2 (in 1A)
    'X2-01': {
      staging: 'BACK + WIDE: Remi small in the doorway; Alexandria from behind, not looking up.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.55, 0.22]], ['remi.head', [-0.45, 0.25]]], from: 102, height: 1.35 }, mm: 50, fstop: 2.8, focus: 'alexandria.head', bounds: BOUNDS },
      cast: {
        alexandria: { ...seated, posture: { sit: 1, lean: 0.4 } }, hatchling: hatchRest(),
        remi: { at: [-2.55, -1.3], face: 'door', look: 'door', acts: [[0.2, 'walk', { to: [-3.15, -1.9], speed: 0.9 }]] },
      },
      set: { door: 0.85 },
    },
    'X2-02': {
      staging: 'DOF: Remi soft in the doorway (backlit), Alexandria in focus but turned to the nest.',
      cam: { rig: 'static', frame: { subjects: [['remi.head', [-0.5, 0.3]], ['alexandria.head', [0.5, 0.15]]], from: 150, height: 1.3 }, mm: 50, fstop: 2.8, focus: 'alexandria.head', bounds: BOUNDS },
      cast: {
        alexandria: { ...seated, posture: { sit: 1, lean: 0.4 } }, hatchling: hatchRest(),
        remi: { at: [-3.2, -1.9], face: 'alexandria', look: 'alexandria.head', lookAmount: 0.6 },
      },
      set: { door: 0.85 },
      lines: [['X2-01', 0.5], ['X2-02', 0.45]],
    },
    'X2-03': {
      staging: 'OTS + DOF: over Alexandria\'s shoulder (sharp); Remi soft and backlit in the doorway answers and goes.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.6, 0.28]], ['remi.head', [-0.18, 0.3]]], from: 96, height: 1.45 }, mm: 50, fstop: 2, focus: 'alexandria.head', bounds: BOUNDS },
      cast: {
        alexandria: { ...seated, posture: { sit: 1, lean: 0.4 } }, hatchling: hatchRest(),
        remi: { at: [-3.2, -1.9], face: 'alexandria', look: 'alexandria.head', lookAmount: 0.5, acts: [[2.1, 'turn', { to: 270, dur: 0.6 }], [2.6, 'walk', { to: [-4.8, -1.9], speed: 1.1 }]] },
      },
      set: { door: 0.85 },
      lines: [['X2-03', 0.5]],
    },
    'X2-14': {
      staging: 'DOF: focus on the hatchling between them; both women soft.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.5, 0.25]], ['attendant.head', [-0.45, 0.3]], ['hatchling', [0.0, -0.4]]], from: 165, height: 1.3 }, mm: 50, fstop: 2.8, focus: 'hatchling', bounds: BOUNDS },
      cast: { alexandria: { ...seated, acts: [[0.9, 'look', { at: 'attendant.head', amount: 0.8 }]] }, attendant: { at: ATT, face: 'hatchling', look: 'hatchling' }, hatchling: hatchRest() },
    },
    'X2-15': {
      staging: 'DOF: the hatchling sharp between them; the women soft, mouths unreadable.',
      cam: { rig: 'static', frame: { subjects: [['attendant.head', [-0.45, 0.3]], ['alexandria.head', [0.45, 0.22]], ['hatchling', [0.0, -0.4]]], from: 184, height: 1.2 }, mm: 50, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
      cast: { alexandria: { ...seated, look: 'attendant.head', lookAmount: 0.6, acts: [[5.6, 'look', { at: 'hatchling.head' }]] }, attendant: { at: ATT, face: 'alexandria', look: 'alexandria.head', lookAmount: 0.6, acts: [[4.6, 'bow', { to: 0.3, dur: 0.5 }]] }, hatchling: hatchRest() },
      lines: [['X2-09', 0.6], ['X2-10', 0.35], ['X2-11', 0.35]],
    },
    'X2-16': {
      staging: 'WIDE: the attendant leaves; the young attendant comes in with fresh water and settles by the door.',
      cam: { rig: 'static', frame: { subjects: [['doorway', [-0.42, -0.35]], ['alexandria.head', [0.55, 0.05]]], from: 150, height: 1.55 }, mm: 35, fstop: 2.8, focus: 'doorway', bounds: BOUNDS },
      cast: {
        alexandria: seated, hatchling: hatchRest(),
        attendant: { at: ATT, face: 'door', look: 'door', acts: [[0.2, 'walk', { path: [[-1.7, -1.75], [-3.0, -1.9], [-4.8, -1.9]], speed: 0.9 }]] },
        youngAttendant: { at: [-4.8, -1.95], face: 90, look: 'egg', acts: [[1.8, 'walk', { to: [-2.75, -1.4], speed: 0.8, face: 'egg' }], [1.8, 'carry', {}]] },
      },
      set: { door: 0.85 },
    },
    'X2-17': {
      staging: 'BACK + DOF: from behind-left of Alexandria; she watches it breathe.',
      cam: { rig: 'static', frame: { subjects: [['alexandria.head', [0.5, 0.35]], ['hatchling', [-0.2, -0.3]]], from: 118, height: 1.3 }, mm: 50, fstop: 2, focus: 'hatchling', bounds: BOUNDS },
      cast: { alexandria: seated, hatchling: hatchRest() },
      fx: [FLICKER, DUST],
    },
  },
};
