// Set scene - VERDOR_HARBOR: scene 1C at quay level (X4-04/05/07/09) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/verdor-harbor.spec.js; table:
// verdor-harbor.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/verdor-harbor.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/verdor-harbor.js';
import spec from './specs/verdor-harbor.spec.js';

const S = createSetScene({ set: 'VERDOR_HARBOR', builder, spec, table: new URL('./verdor-harbor.shots.json', import.meta.url).href, title: 'S01E01 - the harbour at quay level (X4)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
