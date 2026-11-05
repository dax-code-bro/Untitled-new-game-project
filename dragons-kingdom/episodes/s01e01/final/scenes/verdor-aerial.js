// Set scene - VERDOR_AERIAL: scene 1C over the harbour town (X4 aerials) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/verdor-aerial.spec.js; table:
// verdor-aerial.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/verdor-aerial.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/verdor-aerial.js';
import spec from './specs/verdor-aerial.spec.js';

const S = createSetScene({ set: 'VERDOR_AERIAL', builder, spec, table: new URL('./verdor-aerial.shots.json', import.meta.url).href, title: 'S01E01 - over the harbour town (X4)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
