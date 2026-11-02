// Set scene - SKY_OFF_VERDOR: scene 1C in the air (1C-07 .. 1C-19) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/sky-off-verdor.spec.js; table:
// sky-off-verdor.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/sky-off-verdor.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/sky-off-verdor.js';
import spec from './specs/sky-off-verdor.spec.js';

const S = createSetScene({ set: 'SKY_OFF_VERDOR', builder, spec, table: new URL('./sky-off-verdor.shots.json', import.meta.url).href, title: 'S01E01 - in flight off Verdor (1C-07 .. 1C-19)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
