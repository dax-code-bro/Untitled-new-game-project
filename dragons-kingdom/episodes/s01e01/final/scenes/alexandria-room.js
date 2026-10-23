// Set scene - ALEXANDRIA_ROOM: every shot of the queen's room (1A: R1, X1) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/alexandria-room.spec.js; table:
// alexandria-room.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/alexandria-room.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/alexandria-room.js';
import spec from './specs/alexandria-room.spec.js';

const S = createSetScene({ set: 'ALEXANDRIA_ROOM', builder, spec, table: new URL('./alexandria-room.shots.json', import.meta.url).href, title: "S01E01 - the queen's room (1A: R1, X1)" });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
