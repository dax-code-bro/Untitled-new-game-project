// Shot director tool - LAUNCH PROBE: the 1B launch area of the VERDOR_GROUNDS set (sets/verdor-launch.js)
// seen from above and from the master side, with the riders mounted through the stage (`ride:`), the
// keeper on the rig deck and the marks printed (cam.debug). A test of the set piece, not a shot.
//   node render/render.mjs scenes/lib/director/tools/probe-launch.js --preset draft --fps 1 --start 1 --seconds 6 --out DIR
//   (review mode: frame k shows probe shot k at its middle)
import { createSetScene } from '../stage.js';
import * as builder from '../sets/verdor-grounds.js';
import { CHARCOAL_AT, LEAF_1B } from '../sets/verdor-launch.js';

const G = 9;
const DBG = ['charcoal.head', 'charcoal.eye', 'charcoal.chest', 'charcoal.hips', 'charcoal.tail', 'charcoal.neck', 'charcoalSeat', 'leaf.head', 'leaf.chest', 'leaf.hips', 'remiR.head', 'abbyR.head', 'keeper.head', 'rigFoot', 'rigDeck', 'rigGangEnd'];
const cast = {
  charcoal: { kind: 'creature', id: 'charcoal' },
  leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
  remiR: { kind: 'human', id: 'remi_ride', ride: 'charcoal', outfit: 'remi', role: 'REMI' },
  abbyR: { kind: 'human', id: 'abby_ride', ride: 'leaf', outfit: 'abby', role: 'ABBY' },
  abby: { kind: 'human', id: 'abby', role: 'ABBY' },
  remi: { kind: 'human', id: 'remi', role: 'REMI' },
  keeper: { kind: 'human', id: 'keeper1', role: 'GROUND KEEPER' },
  keeper2: { kind: 'human', id: 'keeper2', role: 'KEEPER2' },
  k3: { kind: 'human', id: 'crowd08', role: 'KEEPER' },
};
const crouched = { at: CHARCOAL_AT, face: 190, tack: true, acts: [[0, 'mount', {}]] };   // lowered for mounting (poses.mount)
const resting = { at: CHARCOAL_AT, face: 190, tack: true, acts: [[0, 'stand', {}]] };
const leafC = { at: LEAF_1B, face: 90, tack: true, acts: [[0, 'crouch', { k: 1, breathe: 0.5 }]] };
const spec = {
  set: 'VERDOR_GROUNDS',
  cast,
  shots: {
    'PL-01': {
      cam: { rig: 'static', pos: [30, G + 140, -40], look: [30, G, -58], mm: 24, fstop: 11, focus: 140, debug: DBG },
      set: { rig: 'down', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { charcoal: crouched, leaf: leafC, remiR: {}, abbyR: {}, keeper: { at: 'rigDeck', face: 100 } },
    },
    'PL-02': {
      cam: { rig: 'static', pos: [2, G + 1.7, -6], look: [32, G + 4, -60], mm: 40, fstop: 8, focus: 50, debug: DBG },
      set: { rig: 'up', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { charcoal: resting, leaf: leafC, abby: { at: [17.6, -47.6], face: 270, look: 'leaf.head' }, remi: { at: 'rigFoot', face: 270 } },
    },
    'PL-03': {
      cam: { rig: 'static', pos: [8, G + 7, -78], look: 'rigDeck', mm: 28, fstop: 8, focus: 30, debug: DBG },
      set: { rig: 'down', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { charcoal: crouched, remiR: {}, keeper: { at: 'rigDeck', face: 100 } },
    },
    'PL-04': {
      cam: { rig: 'static', pos: [LEAF_1B[0] - 2, G + 2.2, LEAF_1B[1] + 9], look: [LEAF_1B[0] + 1, G + 1.3, LEAF_1B[1]], mm: 35, fstop: 8, focus: 9 },
      set: { rig: 'down', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { leaf: leafC, abbyR: {} },
    },
    'PL-05': {
      cam: { rig: 'static', frame: { subjects: [['charcoal.eye', [0, 0.05]]], from: 230, height: G + 3, dist: 9 }, mm: 50, fstop: 8, focus: 'charcoal.eye', debug: DBG },
      set: { rig: 'down', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { charcoal: crouched },
    },
    'PL-06': {
      cam: { rig: 'static', pos: [44, G + 9, -20], look: [40, G + 4, -66], mm: 28, fstop: 8, focus: 45 },
      set: { rig: 'down', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { charcoal: crouched, remiR: {}, leaf: leafC, abbyR: {} },
    },
    'PL-07': {
      cam: { rig: 'static', pos: [12, G + 1.6, -70], look: 'rigTower', mm: 28, fstop: 8, focus: 25, debug: ['ropeHandL', 'ropeHandR', 'ropeKeeperL', 'ropeKeeperR', 'keeper2.head', 'k3.head'] },
      set: { rig: 'up', shadowAt: [30, G, -60], shadowExtent: 50 },
      cast: { charcoal: resting, keeper2: { at: 'ropeKeeperL', face: 'rigTower', acts: [[0, 'handsTo', { at: 'ropeHandL', spread: 0.08 }]] }, k3: { at: 'ropeKeeperR', face: 'rigTower', acts: [[0, 'handsTo', { at: 'ropeHandR', spread: 0.08 }]] }, remi: { at: 'rigFoot', face: 270 } },
    },
  },
};
const cont = { tod: 'morning', weather: 'clear', notes: 'probe', sun: [0.959, 0.515, 0.2], exposure: 1.4 };
const jobs = Object.keys(spec.shots);
const table = { set: 'VERDOR_GROUNDS', fps: 24, shots: jobs.map((job, i) => ({ job, seq: i + 1, scene: '1B', set: 'VERDOR_GROUNDS', start_s: 1 + i * 5, start_frame: 24 * (1 + i * 5), frames: 72, pre: 0, post: 0, seconds: 3, dialogue: [], captions: [], fx: [], continuity: cont })) };
const url = URL.createObjectURL(new Blob([JSON.stringify(table)], { type: 'application/json' }));
const S = createSetScene({ set: 'VERDOR_GROUNDS', builder, spec, table: url, title: 'director launch probe' });
export const meta = { ...S.meta, duration: 1 + jobs.length * 5 };
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
