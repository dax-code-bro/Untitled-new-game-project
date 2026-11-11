// Set template TOWN-SQUARE (engine/DESIGN.md section 4): a market square on Cling's plan - architecture/cling.js
// clingSquare(ctx, { layout }) (houses + roofs, fountain, steps, arch, gate, alley, paving) with the square's size
// and the parts the SET block names moved (clingLayout(): every part merged over CLING's; without a layout clingSquare
// is Cling as before). Browser builder: scenes/lib/director/sets/gen/town-square.js. Sheet marks / solids are
// computed in Node from the same layout (clingSquare layoutOnly).
import { clingLayout, clingSquare } from '../../../scenes/lib/architecture/cling.js';
import { squareMarks } from '../../../scenes/lib/director/sets/gen/town-square-layout.js';
import { sunDirOf } from '../../../scenes/lib/director/sets/gen/interior-room-layout.js';

export const name = 'town-square';
export const kind = 'ground-exterior';
export const VOCAB = { fountain: ['fountain', 'well'], steps: ['steps', 'stairs', 'king s steps'], arch: ['arch', 'archway'], gate: ['gate', 'town gate', 'gateway'], alley: ['alley', 'lane'],
  houses: ['houses', 'house rows', 'rows', 'row of houses'], damage: ['damage', 'damaged', 'ruins', 'burnt'] };
export const LIBS = ['scenes/lib/architecture/cling.js clingSquare({ layout }) (houses, roofs, fountain, steps, arch, gate, alley, paving)', 'sets/common.js (sky dome)'];

export function params(desc) {
  const notes = [];
  const sz = desc.size || { w: 40, d: 42 };
  const S = { x0: -sz.w / 2, x1: sz.w / 2, z0: -sz.d * 18 / 42, z1: sz.d * 24 / 42 };
  const layout = { square: S, fountain: { x: 0, z: (S.z0 + S.z1) / 2 - 5 * sz.d / 42 }, steps: { x: sz.w * 0.1, z: S.z1 - 6 }, arch: { x: S.x0 + 0.4, z: S.z1 - 7.5 }, gate: { x: S.x1 + 0.4, z: (S.z0 + S.z1) / 2 + 1.75 },
    alley: { x: S.x0 + sz.w * 0.285, z: S.z0 }, support: { x: sz.w * 0.1 + 9.3, z: S.z1 - 4.6 }, stall: { x: S.x0 + sz.w * 0.29, z: 3 }, music: { x: sz.w * 0.18, z: 1.5 }, watchman: { x: -1.6, z: S.z1 - 12.2 } };
  for (const f of desc.features) if (f.kind === 'damage') notes.push('damage: not built by this template yet - flagged');
  return { P: { layout, seed: 5 }, notes };
}

export const builderText = (id, P, head) => `${head}
import { makeTownSquare } from './gen/town-square.js';

export const PARAMS = ${JSON.stringify(P)};
const S = makeTownSquare(PARAMS);
export const cinematic = S.cinematic;
export const build = S.build;
`;

export async function sheet(id, P, { builderRel, generated }) {
  const L = clingLayout(P.layout);
  const sq = await clingSquare(null, { layoutOnly: true, layout: P.layout, seed: P.seed });
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const solids = sq.houses.map((h) => {
    const c = Math.abs(Math.cos(h.yaw)), s = Math.abs(Math.sin(h.yaw));
    const hx = (h.w * c + h.d * s) / 2, hz = (h.w * s + h.d * c) / 2;
    return { box: [[r3(h.center[0] - hx), r3(h.center[1] - hz)], [r3(h.center[0] + hx), r3(h.center[1] + hz)]], h: r3(h.height || 7), what: `house (${h.side})`, approx: true };
  });
  const S = L.square;
  solids.push({ cyl: [L.fountain.x, L.fountain.z], r: L.fountain.r + 0.3, h: L.fountain.pillarH, what: 'fountain' });
  const marks = squareMarks(L);
  const V = {};
  for (const [k, [x, z]] of Object.entries({ 'north-west': [S.x0 + 3, S.z0 + 3], 'north-east': [S.x1 - 3, S.z0 + 3], 'south-east': [S.x1 - 3, S.z1 - 3], 'south-west': [S.x0 + 3, S.z1 - 3] })) {
    V[`${k} corner`] = { rig: 'static', pos: [r3(x), 2.2, r3(z)], look: [L.fountain.x, 1.6, L.fountain.z], mm: 35, from: 'engine/setgen (generated vantage)', alias: [k] };
  }
  V.steps = { rig: 'static', pos: [L.steps.x, 2.4, r3(L.steps.z - 1)], look: [L.fountain.x, 1.6, L.fountain.z], mm: 35, from: 'engine/setgen (generated vantage)' };
  return {
    set: id, frame: 'LOCAL', kind: 'ground-exterior', builder: builderRel, specs: [], generated,
    ground: { type: 'plane', y: 0.03 }, bounds: null,
    marks: Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, { ...m, src: 'engine/setgen town-square layout' }])),
    objects: {}, homes: {},
    areas: { square: { poly: [[S.x0 + 2, S.z0 + 2], [S.x1 - 2, S.z0 + 2], [S.x1 - 2, S.z1 - 2], [S.x0 + 2, S.z1 - 2]], slots: 24 } },
    paths: { 'arch-fountain': [[L.arch.x + 1, 0, L.arch.z], [L.fountain.x - L.fountain.r - 1.5, 0, L.fountain.z]], 'gate-fountain': [[L.gate.x - 1, 0, L.gate.z], [L.fountain.x + L.fountain.r + 1.5, 0, L.fountain.z]] },
    vantages: V, solids, lines: {}, state: {},
    cost: { heavy: true, workers: 1, draft_s_per_frame: 12, native_4k_s_per_frame: 205, basis: 'ESTIMATE: CLING_SQUARE class (F5)' },
  };
}

export function continuity(desc) {
  const t = desc.tod;
  if (!t) return null;
  return { tod: t.tod || t.text, sun: t.az != null ? sunDirOf(t.az, Math.max(1, t.el)) : null, exposure: 1.5 };
}
