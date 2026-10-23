// Set scene - PALACE_CORRIDOR: every shot of the palace corridors (1A: X1, X2) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/palace-corridor.spec.js; table:
// palace-corridor.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/palace-corridor.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/palace-corridor.js';
import spec from './specs/palace-corridor.spec.js';

const S = createSetScene({ set: 'PALACE_CORRIDOR', builder, spec, table: new URL('./palace-corridor.shots.json', import.meta.url).href, title: "S01E01 - the palace corridors (1A: X1, X2)" });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
