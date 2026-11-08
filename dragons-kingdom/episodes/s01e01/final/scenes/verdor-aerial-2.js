// Set scene - VERDOR_AERIAL_2: X4-10 (Leaf past the Santa Maria's mainmast, the lookout) from one browser setup -
// a second spec on the VERDOR_AERIAL shots (registry `shotSet`; sets/verdor-aerial-2.js wraps sets/verdor-aerial.js).
// Shot director: scenes/lib/director (README.md). Shots: specs/verdor-aerial-2.spec.js; table:
// verdor-aerial-2.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/verdor-aerial-2.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/verdor-aerial-2.js';
import spec from './specs/verdor-aerial-2.spec.js';

const S = createSetScene({ set: 'VERDOR_AERIAL_2', builder, spec, table: new URL('./verdor-aerial-2.shots.json', import.meta.url).href, title: 'S01E01 - past the Santa Maria\'s mast (X4-10)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
