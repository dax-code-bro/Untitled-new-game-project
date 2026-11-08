// Set scene - OUTER_ROCKS: scene 1C, the race through the outer rocks (X6-01..03, X6-08..18) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/outer-rocks.spec.js; table:
// outer-rocks.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/outer-rocks.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/outer-rocks.js';
import spec from './specs/outer-rocks.spec.js';

const S = createSetScene({ set: 'OUTER_ROCKS', builder, spec, table: new URL('./outer-rocks.shots.json', import.meta.url).href, title: 'S01E01 - the outer rocks (X6)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
