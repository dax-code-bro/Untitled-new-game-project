// Set scene - BIRTHING_CHAMBER: every shot of the birthing chamber (TITLE, 1A) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/birthing-chamber.spec.js; table:
// birthing-chamber.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/birthing-chamber.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/birthing-chamber.js';
import spec from './specs/birthing-chamber.spec.js';

const S = createSetScene({ set: 'BIRTHING_CHAMBER', builder, spec, table: new URL('./birthing-chamber.shots.json', import.meta.url).href, title: 'S01E01 - the birthing chamber (TITLE, 1A)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
