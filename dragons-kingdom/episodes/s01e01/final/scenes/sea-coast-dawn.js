// Set scene - SEA_COAST_DAWN: every shot of the prologue at sea (P-02 .. P-07) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/sea-coast-dawn.spec.js; table:
// sea-coast-dawn.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/sea-coast-dawn.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/sea-coast-dawn.js';
import spec from './specs/sea-coast-dawn.spec.js';

const S = createSetScene({ set: 'SEA_COAST_DAWN', builder, spec, table: new URL('./sea-coast-dawn.shots.json', import.meta.url).href, title: 'S01E01 - the prologue at sea (P-02 .. P-07)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
