// Set scene - VERDOR_GROUNDS: the riding grounds (P-17, X2-08 .. X2-13) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/verdor-grounds.spec.js; table:
// verdor-grounds.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/verdor-grounds.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/verdor-grounds.js';
import spec from './specs/verdor-grounds.spec.js';

const S = createSetScene({ set: 'VERDOR_GROUNDS', builder, spec, table: new URL('./verdor-grounds.shots.json', import.meta.url).href, title: 'S01E01 - the riding grounds (P-17, X2-08 .. X2-13)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
