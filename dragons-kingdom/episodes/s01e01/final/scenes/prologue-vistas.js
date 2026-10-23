// Set scene - PROLOGUE_VISTAS: the prologue's dissolving landscapes (P-08 .. P-16) from one browser setup.
// Shot director: scenes/lib/director (README.md). Shots: specs/prologue-vistas.spec.js; table:
// prologue-vistas.shots.json (node scenes/lib/director/tools/build-shots.mjs).
//   node render/render.mjs episodes/s01e01/final/scenes/prologue-vistas.js --preset draft --start <start_s> --seconds <frames/24>
import { createSetScene } from '../../../../scenes/lib/director/stage.js';
import * as builder from '../../../../scenes/lib/director/sets/prologue-vistas.js';
import spec from './specs/prologue-vistas.spec.js';

const S = createSetScene({ set: 'PROLOGUE_VISTAS', builder, spec, table: new URL('./prologue-vistas.shots.json', import.meta.url).href, title: 'S01E01 - the prologue landscapes (P-08 .. P-16)' });
export const meta = S.meta;
export async function setup(ctx) { await S.setup(ctx); }
export function update(t, ctx) { S.update(t, ctx); }
