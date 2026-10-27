// Shot director tool - RIDE PROBE: riders seated through the director (cast `ride: '<creature>'`) on
// the real VERDOR_GROUNDS set: Abby on Leaf standing, then walking, from three sides. A test of the
// stage's rider path (saddle + straddle + grab bar from the creatures library, the humans library's
// seated builds), not a shot of the episode.
//   node scenes/lib/director/tools/render-shots.mjs ... (not in the edit list) - render it directly:
//   node render/render.mjs scenes/lib/director/tools/probe-ride.js --preset draft --start 1 --seconds 0.05 --still --out DIR
import { createSetScene } from '../stage.js';
import * as builder from '../sets/verdor-grounds.js';

const G = 9, LEAF = [8, -44];
const spec = {
  set: 'VERDOR_GROUNDS',
  cast: {
    leaf: { kind: 'creature', id: 'leaf', quality: 'standard' },
    abby: { kind: 'human', id: 'abby_ride', ride: 'leaf', outfit: 'abby' },
  },
  shots: {
    'RIDE-01': {
      staging: 'probe: Abby seated on Leaf, 3/4 front',
      cam: { rig: 'static', pos: [LEAF[0] + 5.5, G + 2.2, LEAF[1] + 7], look: [LEAF[0], G + 1.6, LEAF[1]], mm: 35, fstop: 8, focus: 'leaf.chest' },
      cast: { leaf: { at: LEAF, face: 160, acts: [[0, 'stand', { breathe: 0.5 }]] }, abby: {} },
    },
    'RIDE-02': {
      staging: 'probe: Abby seated on Leaf, side on, Leaf walking',
      cam: { rig: 'static', pos: [LEAF[0] - 9, G + 1.8, LEAF[1] + 2], look: [LEAF[0], G + 1.5, LEAF[1] + 2], mm: 35, fstop: 8, focus: 'leaf.chest' },
      cast: { leaf: { at: LEAF, face: 180, acts: [[0, 'walk', { to: [LEAF[0], LEAF[1] + 6], speed: 1.2 }]] }, abby: {} },
    },
    'RIDE-03': {
      staging: 'probe: from behind and above',
      cam: { rig: 'static', pos: [LEAF[0] - 2, G + 4.5, LEAF[1] - 6], look: [LEAF[0], G + 1.5, LEAF[1]], mm: 35, fstop: 8, focus: 'leaf.chest' },
      cast: { leaf: { at: LEAF, face: 180, acts: [[0, 'stand', { breathe: 0.5 }]] }, abby: {} },
    },
  },
};
const cont = { tod: 'morning', weather: 'clear', notes: 'probe', sun: [0.853, 0.5, 0.15], exposure: 1.4 };
const table = { set: 'VERDOR_GROUNDS', fps: 24, shots: ['RIDE-01', 'RIDE-02', 'RIDE-03'].map((job, i) => ({ job, seq: i + 1, scene: '1B', set: 'VERDOR_GROUNDS', start_s: 1 + i * 5, start_frame: 24 * (1 + i * 5), frames: 72, pre: 0, post: 0, seconds: 3, dialogue: [], captions: [], fx: [], continuity: cont, staging: spec.shots[job].staging })) };
const url = URL.createObjectURL(new Blob([JSON.stringify(table)], { type: 'application/json' }));
const S = createSetScene({ set: 'VERDOR_GROUNDS', builder, spec, table: url, title: 'director ride probe' });
export const meta = { ...S.meta, duration: 16 };
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
