// Set template INTERIOR-ROOM (engine/DESIGN.md section 4): the alexandria-room / palace-corridor pattern - masonry
// walls with a door and a window, a flag floor, a joisted ceiling, wall lamps and furniture - as a generated set.
// Browser builder: scenes/lib/director/sets/gen/interior-room.js; the layout (and every sheet mark) comes from
// scenes/lib/director/sets/gen/interior-room-layout.js roomLayout(PARAMS), in Node and in the browser alike.
import { roomLayout, ITEMS, sunDirOf } from '../../../scenes/lib/director/sets/gen/interior-room-layout.js';

export const name = 'interior-room';
export const kind = 'interior';
export const VOCAB = {
  oven: ['bread oven', 'baking oven', 'oven', 'kiln'], hearth: ['hearth', 'fireplace', 'open fire'], counter: ['counter', 'serving board', 'shop counter'],
  table: ['table', 'tables', 'kitchen table'], bench: ['bench', 'benches'], shelf: ['shelf', 'shelves'], bed: ['bed', 'cot'],
  barrel: ['barrel', 'barrels', 'cask', 'casks'], sack: ['sack', 'sacks', 'flour sacks', 'flour sack'], crate: ['crate', 'crates'], stool: ['stool', 'stools'],
  lamp: ['oil lamp', 'oil lamps', 'lamp', 'lamps', 'lantern', 'lanterns'], window: ['window', 'windows'], door: ['door', 'doorway', 'entrance'],
  stone: ['rubble walls', 'stone walls', 'washed walls', 'plaster walls', 'lime-washed walls'],
};
export const LIBS = ['scenes/lib/architecture (masonry walls with openings, flag floor, beam ceiling, door leaf, bench / stool / bowl, barrel / crate / sack)',
  'scenes/lib/director/sets/common.js (wall lamps, sky dome, room environment)', 'sets/gen/interior-room.js (oven / hearth, counter, table, shelf, bed)'];

/** description -> PARAMS (deterministic) + notes */
export function params(desc) {
  const notes = [];
  const sz = desc.size || { w: 5, d: 4, h: 3 };
  const P = { w: sz.w, d: sz.d, h: sz.h ?? 3.2, T: 0.6, seed: 401, stone: 'washed', door: null, window: null, items: [], lamps: 0 };
  if (!desc.size) notes.push('no size: 5 x 4 x 3 m');
  for (const f of desc.features) {
    if (f.not) continue;
    if (f.kind === 'door') P.door = { wall: f.wall || 'south' };
    else if (f.kind === 'window') P.window = { wall: f.wall || 'east' };
    else if (f.kind === 'lamp') P.lamps += f.n;
    else if (f.kind === 'stone') P.stone = /rubble/.test(f.phrase) ? 'rubble' : 'washed';
    else if (ITEMS[f.kind]) P.items.push({ kind: f.kind, ...(f.wall ? { wall: f.wall } : {}), ...(f.place ? { place: f.place } : {}), ...(f.n > 1 ? { n: f.n } : {}) });
  }
  if (!P.door) { P.door = { wall: 'south' }; notes.push('no door named: a door in the south wall'); }
  if (!P.window) notes.push('no window named: none (an interior lit by its lamps and the door)');
  // the room faces the world: "facing east" turns nothing here (the walls are named in the world frame already)
  P.world = desc.world ? { frame: desc.world.frame, at: desc.world.at, facing: desc.world.facing } : null;
  return { P, notes };
}

export const builderText = (id, P, head) => `${head}
import { makeInteriorRoom } from './gen/interior-room.js';

export const PARAMS = ${JSON.stringify(P)};
const S = makeInteriorRoom(PARAMS);
export const LAYOUT = S.LAYOUT;
export const cinematic = S.cinematic;
export const build = S.build;
`;

/** The set sheet (engine/DESIGN.md 3.4) computed in Node from the same PARAMS the builder gets. */
export function sheet(id, P, { builderRel, generated }) {
  const L = roomLayout(P);
  return {
    set: id, frame: P.world?.frame || 'LOCAL', kind: 'interior', builder: builderRel, specs: [], generated,
    world: P.world || null,
    ground: { type: 'plane', y: 0, note: 'flag floor' },
    bounds: L.bounds,
    marks: Object.fromEntries(Object.entries(L.marks).map(([k, m]) => [k, { at: m.at, src: 'engine/setgen interior-room layout', ...(m.alias?.length ? { alias: m.alias } : {}), ...(m.outside ? { outside: true } : {}) }])),
    objects: Object.fromEntries(L.items.map((it) => [it.name, { at: L.marks[it.name].at, size: it.size, what: ITEMS[it.kind].label }])),
    homes: {},
    // the stager's place knowledge (engine/stager/places.json format): every mark here is a standing spot - one stands ON
    // it (near 0), facing what it is for
    places: { how: Object.fromEntries(Object.entries(L.marks).filter(([k, m]) => m.at[1] === 0 && !m.outside && k !== 'centre').map(([k]) => [k, { near: 0 }])) },
    areas: L.areas,
    paths: L.paths,
    vantages: L.vantages,
    solids: L.solids,
    lines: {},
    state: { lamps: 'continuity lamps 0..1 (default 1)', sun: 'continuity sun (final/continuity.js)' },
    cost: { heavy: false, workers: 1, draft_s_per_frame: 8, native_4k_s_per_frame: 64, basis: 'ESTIMATE: ALEXANDRIA_ROOM class (0.6 x F4: an interior, a few people, window light)' },
  };
}

export function continuity(desc, P) {
  const t = desc.tod;
  if (!t) return null;
  const sun = t.az != null && t.el != null && t.el > -1 ? sunDirOf(t.az, t.el) : null;
  return { tod: t.tod || t.text, sun, lamps: t.night ? 1 : P.lamps ? 0.8 : 0, exposure: t.night ? 0.9 : 1.3 };
}
