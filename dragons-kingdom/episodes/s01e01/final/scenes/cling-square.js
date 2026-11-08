// Set scene - CLING_SQUARE: scene 1C in Cling, the morning before the festival (X5 / R3) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/cling-square.spec.js; table:
// cling-square.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/cling-square.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/cling-square.js';
import spec from './specs/cling-square.spec.js';

const S = createSetScene({ set: 'CLING_SQUARE', builder, spec, table: new URL('./cling-square.shots.json', import.meta.url).href, title: 'S01E01 - Cling square, the morning before the festival (X5)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
