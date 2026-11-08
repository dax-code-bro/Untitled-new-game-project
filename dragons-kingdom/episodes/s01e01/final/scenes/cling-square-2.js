// Set scene - CLING_SQUARE_2: the rest of the Cling square in scene 1C (X5-10..18, R3-01..04) from one browser setup -
// a second spec on the CLING_SQUARE shots (registry `shotSet`; sets/cling-square-2.js wraps sets/cling-square.js).
// Shot director: scenes/lib/director (README.md). Shots: specs/cling-square-2.spec.js; table:
// cling-square-2.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/cling-square-2.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/cling-square-2.js';
import spec from './specs/cling-square-2.spec.js';

const S = createSetScene({ set: 'CLING_SQUARE_2', builder, spec, table: new URL('./cling-square-2.shots.json', import.meta.url).href, title: 'S01E01 - Cling square, the morning before the festival (X5-10..18, R3)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
