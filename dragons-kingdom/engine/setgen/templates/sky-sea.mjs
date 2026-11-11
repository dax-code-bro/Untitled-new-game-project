// Set template SKY-SEA (engine/DESIGN.md section 4): open sky over the sea off the Verdor coast - SKY_OFF_VERDOR's
// builder as-is (coast, sea, physical sky, sea-mist banks), its own sun from the episode's continuity
// (final/continuity.js); the sheet is SKY_OFF_VERDOR's (paths, areas, solids) without its Episode 1 shot vantages.
import fs from 'node:fs';
import path from 'node:path';
import { sunDirOf } from '../../../scenes/lib/director/sets/gen/interior-room-layout.js';

export const name = 'sky-sea';
export const kind = 'air';
export const BASE = 'SKY_OFF_VERDOR';
export const VOCAB = { coast: ['coast', 'cliffs', 'shore'], sea: ['sea', 'ocean', 'water'], mist: ['mist', 'fog', 'haze', 'sea mist'], cloud: ['cloud deck', 'clouds', 'cloud'], sun: ['sun', 'low sun', 'glare'] };
export const LIBS = ['sets/sky-off-verdor.js (its build() as-is: dk/ocean.js, terrain coast, physical sky, sea mist)'];

export function params(desc) {
  const notes = [];
  const want = new Set(desc.features.map((f) => f.kind));
  if (want.has('cloud')) notes.push('cloud deck: not built by this template yet (sets/cloud-deck.js needs its own wrapper) - flagged');
  return { P: { base: BASE, features: [...want] }, notes };
}

export const builderText = (id, P, head) => `${head}
// ${id}: the ${BASE} set (sets/sky-off-verdor.js) with this episode's sun (final/continuity.js).
export { cinematic, build } from './sky-off-verdor.js';
export const PARAMS = ${JSON.stringify(P)};
`;

export function sheet(id, P, { builderRel, generated, root }) {
  const base = JSON.parse(fs.readFileSync(path.join(root, 'scenes/lib/director/sets/sheets', `${BASE}.json`), 'utf8'));
  const vantages = Object.fromEntries(Object.entries(base.vantages || {}).filter(([, v]) => v.rig === 'static'));
  return { ...base, set: id, builder: builderRel, specs: [], generated, vantages, from: BASE, continuity: undefined };
}

export function continuity(desc) {
  const t = desc.tod;
  if (!t) return null;
  return { tod: t.tod || t.text, sun: t.az != null ? sunDirOf(t.az, Math.max(1, t.el)) : null, exposure: 1.1 };
}
