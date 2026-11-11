#!/usr/bin/env node
// Engine phase 3 (engine/DESIGN.md section 3.4): SET SHEETS.
//   node engine/tools/sheet.mjs [--set CLING_SQUARE|...|all] [--check] [--episode s01e01]
// writes scenes/lib/director/sets/sheets/<SET>.json: plain JSON (Node-readable, no three.js) the stager and previs
// read instead of building the set: marks (+ aliases), set objects, homes, areas with slots, paths, vantages (every
// hand-written shot camera, named by its shot id), solids (occlusion prisms), screen-direction lines, shot state the
// builder understands, and render cost.
// Sources, per set: the builder's static exports (CLING, STALL, MUSIC, WATCH, DEF, gapFrame, stackRing, coastX ...),
// clingSquare({ layoutOnly: true }) for the Cling houses, the specs' `map` / previs marks / homes, the episode's
// shot list (frames, dialogue) and cut/timings.json. Builders are imported (three.js maths only, never build()):
// a resolve hook maps the browser import map's `dk/` to runtime/lib/. Deterministic: same inputs, same bytes.
// Marks a builder computes from its terrain at build time are given approximately (`approx: true`).
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, dirs, episodeArg } from '../../scenes/lib/director/episode-paths.js';

const DK = pathToFileURL(path.join(ROOT, 'runtime/lib/')).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s.startsWith('dk/') ? { url: ${JSON.stringify(DK)} + s.slice(3), shortCircuit: true } : n(s, c); }`));

export const SHEET_DIR = path.join(ROOT, 'scenes/lib/director/sets/sheets');
export const SHEET_SETS = ['CLING_SQUARE', 'VERDOR_AERIAL', 'VERDOR_HARBOR', 'OUTER_ROCKS', 'SKY_OFF_VERDOR', 'BIRTHING_CHAMBER'];
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const D2R = Math.PI / 180;
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 + 0 : Array.isArray(v) ? v.map(r3) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r3(x)])) : v);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
/** an ellipse / circle as a convex polygon in x/z */
const ring = (cx, cz, ra, rb, n = 12, rot = 0, map = null) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, u = Math.cos(a) * ra, v = Math.sin(a) * rb;
  if (map) { const p = map(u, v); return [p[0], p[2]]; }
  return [cx + u * Math.cos(rot) - v * Math.sin(rot), cz + u * Math.sin(rot) + v * Math.cos(rot)];
});
/** an oriented box footprint (centre, half sizes along the local x / z, yaw: local +z = world (sin yaw, cos yaw)) */
const obox = (c, hx, hz, yaw) => {
  const X = [Math.cos(yaw), -Math.sin(yaw)], Z = [Math.sin(yaw), Math.cos(yaw)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + X[0] * a * hx + Z[0] * b * hz, c[1] + X[1] * a * hx + Z[1] * b * hz]);
};
const seg = (a, b, w) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = [-dz / L * w / 2, dx / L * w / 2]; return [[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]; };

// ---- geometry helpers for areas ---------------------------------------------------------------------------------
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const inSolid = (s, x, z) => (s.box ? x >= s.box[0][0] && x <= s.box[1][0] && z >= s.box[0][1] && z <= s.box[1][1]
  : s.cyl ? Math.hypot(x - s.cyl[0], z - s.cyl[1]) <= s.r : s.poly ? inPoly(s.poly, x, z) : false);
/** n standing slots in a polygon: a grid at the spacing the count asks for, clear of solids (0.5 m), evenly picked */
function slots(poly, n, solids, y = 0) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const step = Math.max(1.2, Math.sqrt(Math.abs(area) / 2 / Math.max(1, n * 2)));
  const free = [];
  for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) {
    if (!inPoly(poly, x, z)) continue;
    if (solids.some((s) => (s.y0 ?? 0) < y + 1.8 && (s.y0 ?? 0) + s.h > y && [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([a, b]) => inSolid(s, x + a, z + b)))) continue;
    free.push([x, y, z]);
  }
  const k = Math.min(n, free.length);
  return Array.from({ length: k }, (_, i) => free[Math.floor(((i + 0.5) * free.length) / k)]);
}

// ---- per-set layouts ----------------------------------------------------------------------------------------------
const LAYOUT = {
  async CLING_SQUARE() {
    const { CLING, clingSquare } = await imp('scenes/lib/architecture/cling.js');
    const { STALL, MUSIC, WATCH } = await imp('scenes/lib/director/sets/cling-square.js');
    const { DOOR } = await imp('scenes/lib/director/sets/cling-square-2.js');
    const PAVE = 0.03, S = CLING.square, T = STALL, al = CLING.alley, ar = CLING.arch, gt = CLING.gate, st = CLING.steps;
    const marks = {
      fountain: { at: [0, PAVE, -2], r: CLING.fountain.r, alias: ['basin', 'centre', 'center'] }, pillar: { at: [0, 2.2, -2], alias: ['central pillar'] },
      steps: { at: [st.x, 0.6, st.z + 1], alias: ["king's steps", 'kings steps'] }, support: { at: [CLING.support.x, 1.2, CLING.support.z], alias: ['stone support', 'pier'] },
      arch: { at: [ar.x, 2.6, ar.z], alias: ['stone arch', 'archway'] }, gate: { at: [gt.x, 2.4, gt.z], alias: ['town gate'] },
      alley: { at: [al.x, 2.2, al.z] }, music: { at: [MUSIC.at[0], MUSIC.h, MUSIC.at[1]], alias: ['music space', 'dais'] },
      stall: { at: [T.c[0], PAVE, T.c[1]], face: 180, alias: ["vendor's stall", 'counter'] },
      watch: { at: [(WATCH.x0 + WATCH.x1) / 2, WATCH.deck, (WATCH.z0 + WATCH.z1) / 2], alias: ["watchman's platform", 'platform', 'wall'] },
      road: { at: [70, PAVE, 6], approx: true, alias: ['broad road'] },
      houseDoor: { at: [DOOR[0], 1.2, DOOR[1]], approx: true, alias: ['house door', 'open door'], src: 'cling-square-2 DOOR' },
    };
    // set objects (builder `objects`): rest positions; moving ones are keyed per shot
    const objects = {
      cart: { at: [T.c[0], PAVE, T.c[1]], moves: 'set.stall.cart' }, cartGrip: { at: [T.c[0], 0.85, T.c[1] - 2.0], approx: true, moves: 'with the cart' },
      ladder: { at: null, moves: 'set.ladder {a, b}' }, ladderA: { at: null, moves: 'set.ladder' }, ladderB: { at: null, moves: 'set.ladder' },
      legFoot: { at: [T.x0, PAVE, T.zf] },
      clothFL: { at: [T.corner.fl[0], T.hf, T.corner.fl[1]], moves: 'set.stall' }, clothFR: { at: [T.corner.fr[0], T.hf, T.corner.fr[1]], moves: 'set.stall' },
      clothBL: { at: [T.corner.bl[0], T.hb, T.corner.bl[1]], moves: 'set.stall' }, clothBR: { at: [T.corner.br[0], T.hb, T.corner.br[1]], moves: 'set.stall' },
      bird1: { at: null, moves: 'set.birds' }, bird2: { at: null, moves: 'set.birds' },
      // CLING_SQUARE_2's dressing (the same square, its own builder wrapper)
      doorLeaf: { at: [DOOR[0], 1.1, DOOR[1]], approx: true, src: 'cling-square-2' }, parcel: { at: null, moves: 'carried', src: 'cling-square-2' },
      lute: { at: null, moves: 'carried', src: 'cling-square-2' }, luteLap: { at: null, src: 'cling-square-2' }, pipe: { at: null, moves: 'carried', src: 'cling-square-2' },
      banner: { at: null, src: 'cling-square-2' }, table: { at: null, src: 'cling-square-2 (inside the house by the arch)' },
    };
    const lay = await clingSquare({}, { layoutOnly: true });
    const solids = [];
    for (const h of lay.houses) {
      const F = h.frame, c = [F[0], F[2]], yaw = Math.atan2(F[9], F[11]);
      solids.push({ poly: obox(c, h.w / 2, h.d / 2, yaw), h: +((h.height + h.ridge) / 2).toFixed(2), ridge: h.ridge, what: `${h.side} row${h.back ? ' (back)' : ''}${h.passage ? ' (arch house)' : ''}` });
    }
    solids.push(
      { cyl: [0, -2], r: CLING.fountain.r, h: 0.6, what: 'fountain basin' }, { cyl: [0, -2], r: 0.5, h: CLING.fountain.pillarH, what: 'fountain pillar' },
      { box: [[st.x - st.w / 2, st.z], [st.x + st.w / 2, st.z + st.n * st.tread]], h: st.n * st.rise, what: "king's steps" },
      { cyl: [CLING.support.x, CLING.support.z], r: 0.8, h: 2.4, what: 'stone support' },
      { box: [[T.x0, T.zb], [T.x1, T.zf]], y0: 0.9, h: 0.1, what: 'stall counter (cart)' },
      { box: [[MUSIC.at[0] - MUSIC.w / 2, MUSIC.at[1] - MUSIC.d / 2], [MUSIC.at[0] + MUSIC.w / 2, MUSIC.at[1] + MUSIC.d / 2]], h: MUSIC.h, what: 'music dais' },
      { box: [[WATCH.x0, WATCH.z0], [WATCH.x1, WATCH.z1]], y0: WATCH.deck - 0.2, h: 0.2, what: "watchman's platform deck" },
      // (phase 5) the platform's timbers (cling-square.js: four posts, the rail posts, the rails on three sides) and the
      // ladder leaning on the deck edge from the square: X5-16's watchman hid behind them while previs saw him clear
      ...[[WATCH.x0 + 0.1, WATCH.z0 + 0.1], [WATCH.x0 + 0.1, WATCH.z1 - 0.1], [WATCH.x1 - 0.1, WATCH.z0 + 0.1], [WATCH.x1 - 0.1, WATCH.z1 - 0.1]].flatMap(([x, z]) => [
        { box: [[x - 0.1, z - 0.1], [x + 0.1, z + 0.1]], h: WATCH.deck, what: 'watch platform post' },
        { box: [[x - 0.06, z - 0.06], [x + 0.06, z + 0.06]], y0: WATCH.deck, h: 1.1, what: 'watch platform rail post' }]),
      { box: [[WATCH.x0, WATCH.z0 + 0.06], [WATCH.x1, WATCH.z0 + 0.14]], y0: WATCH.deck + 1.0, h: 0.1, what: 'watch platform rail' },
      { box: [[WATCH.x0, WATCH.z1 - 0.14], [WATCH.x1, WATCH.z1 - 0.06]], y0: WATCH.deck + 1.0, h: 0.1, what: 'watch platform rail' },
      { box: [[WATCH.x1 - 0.14, WATCH.z0], [WATCH.x1 - 0.06, WATCH.z1]], y0: WATCH.deck + 1.0, h: 0.1, what: 'watch platform rail' },
      { box: [[WATCH.ladderX - 0.05, (WATCH.z0 + WATCH.z1) / 2 - 0.28], [WATCH.x0, (WATCH.z0 + WATCH.z1) / 2 + 0.28]], h: WATCH.deck + 0.9, what: 'watch ladder' },
      { box: [[S.x1, gt.z - gt.w / 2 - gt.pier - 12], [S.x1 + 0.9, gt.z - gt.w / 2 - gt.pier]], h: 3.6, what: 'town wall north of the gate', approx: true },
      { box: [[S.x1, gt.z + gt.w / 2 + gt.pier], [S.x1 + 0.9, gt.z + gt.w / 2 + gt.pier + 12]], h: 3.6, what: 'town wall south of the gate', approx: true },
    );
    const sq = [[S.x0 + 0.4, S.z0 + 0.4], [S.x1 - 0.4, S.z0 + 0.4], [S.x1 - 0.4, st.z - 0.1], [S.x0 + 0.4, st.z - 0.1]];
    return {
      frame: 'CLING', kind: 'ground-exterior', ground: { type: 'plane', y: PAVE, note: 'the square\'s paving; the land beyond rises (loadClingLand)' }, bounds: null,
      marks, objects,
      areas: {
        square: { poly: sq, y: PAVE, slots: 24 }, music: { poly: obox(MUSIC.at, MUSIC.w / 2, MUSIC.d / 2, 0), y: MUSIC.h, slots: 3 },
        'steps-foot': { poly: obox([st.x, st.z - 1.4], st.w / 2 - 0.5, 1.1, 0), y: PAVE, slots: 6 }, watch: { poly: obox([(WATCH.x0 + WATCH.x1) / 2, (WATCH.z0 + WATCH.z1) / 2], 1.4, 1.3, 0), y: WATCH.deck, slots: 2 },
      },
      paths: {
        'alley-stall': [[al.x + 7.5, 0, S.z0 - 18.5], [al.x + 2.2, 0, S.z0 - 13.5], [al.x, 0, S.z0 - 9.6], [al.x, PAVE, S.z0 + 0.6], [T.c[0], PAVE, 0.65]],
        'arch-lane': [[S.x0 + 0.2, PAVE, ar.z], [S.x0 - 14, 0, ar.z + 0.3], [S.x0 - 23, 0, ar.z - 6.5]],
        'arch-fountain': [[ar.x + 1, PAVE, ar.z], [-3.5, PAVE, 1.5]], 'steps-fountain': [[st.x, PAVE, st.z - 0.5], [0.5, PAVE, 1.5]],
        'gate-road': [[gt.x - 1, PAVE, gt.z], [gt.x + 6, 0, gt.z], [70, 0, 6]], 'stall-music': [[T.c[0] + 1.5, PAVE, T.c[1] - 1], [MUSIC.at[0] - 2, PAVE, MUSIC.at[1]]],
      },
      solids,
      state: {
        stall: 'cart: follow | [[t, [x, z]]] | rest; lift; poles [k0..k3]; bars [front, back]; cloth k; low m; rock {amp, hz, until}; stones [t1, t2]; off k; snag {a, b}; false = no stall',
        ladder: '{ a, b }: carried on the left shoulders of actors a (front) and b', birds: '[{ on: roof | [x, y, z], yaw, peck }]', shadowAt: '[x, y, z] + shadowExtent',
      },
    };
  },

  async SKY_OFF_VERDOR() {
    const { coastX, FIELD } = await imp('scenes/lib/director/sets/sky-off-verdor.js');
    const { makeNoise } = await imp('scenes/lib/sets/terrain.js');
    const N = makeNoise(23);
    const coast = (z) => coastX(N, z);
    return {
      frame: 'VERDOR', kind: 'air-coast', ground: { type: 'terrain', sea: 0, note: 'sea at y 0 east of the coast (x > coastX(z)); cliffs 9-60 m and hills inland' }, bounds: null,
      marks: {
        grounds: { at: [4, FIELD, -34], alias: ['riding grounds', 'field'] }, scar: { at: [43, FIELD, -60] }, headland: { at: [120, 40, -700] },
        coast0: { at: [coast(0), 0, 0], alias: ['coast'] }, coast600: { at: [coast(600), 0, 600] }, coast1500: { at: [coast(1500), 0, 1500] },
      },
      objects: {},
      areas: {},
      paths: {
        coast: Array.from({ length: 13 }, (_, i) => [coast(i * 300), 0, i * 300]),
        // the 1C formation's line (verdor-aerial.spec.js FLIGHT CLOCK: zF(T) = 300 + 16 T, the coast x ~295)
        'flight-1C': [[295, 60, 300], [295, 60, 1052], [300, 60, 1292]],
        // (phase 5) the X6 legs (sky-off-verdor.spec.js map notes): SSE down the coast ~150 m offshore toward the outer
        // rocks (heading 158, from Leaf's first X6 air position), and the return north along the coast
        'flight-X6': [[560, 62, 2600], [700, 62, 2947]],
        'flight-X6-return': [[800, 60, 3020], [700, 60, 2700], [650, 60, 2400]],
      },
      // (phase 5) SCREEN DIRECTION (DESIGN 3.3): the 1C flight line runs L -> R with the cameras on the flyers' RIGHT
      // (inland while they fly south over open water; shotlist flight_line_1C_to_1E). `travel`: the flyer's own heading
      // is the line; a camera more than `tol` deg onto the other side is rejected unless the row's move says "reverse".
      lines: { '1C': { travel: 'heading', camSide: 'right', tol: 25, note: 'flight line 1C-1E: cameras on the flyers\' right (inland going south), travel L -> R' } },
      solids: [],
      state: { shadowAt: '[x, y, z] + shadowExtent (the sun\'s shadow box follows the action)' },
      _coast: coast,
    };
  },

  async OUTER_ROCKS() {
    const sky = await LAYOUT.SKY_OFF_VERDOR();
    const { DEF, gapFrame, stackRing } = await imp('scenes/lib/director/sets/outer-rocks.js');
    const W = gapFrame(DEF), S = DEF.stacks, C = S.C;
    const cTop = stackRing(C, C.H, null), cW = W(cTop.cu, cTop.cv);
    const solids = [];
    // each stack as 4 stacked convex prisms (its ellipse at the slice's middle; noise and ledges left out, +-7 %)
    for (const [k, s] of Object.entries(S)) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const y0 = (s.H * i) / n, y1 = (s.H * (i + 1)) / n, r = stackRing(s, (y0 + y1) / 2, null);
        solids.push({ poly: ring(0, 0, r.ru, r.rv, 14, 0, (u, v) => W(r.cu + u, r.cv + v)), y0: i ? y0 : -4, h: y1 - (i ? y0 : -4), what: `stack ${k}` });
      }
    }
    return {
      ...sky, kind: 'air-sea-stacks', _coast: undefined,
      ground: { type: 'sea', y: 0, note: 'the sea; the flat top of the low stack C is ground at y 17 (Leaf lands there)' },
      map: { gap: DEF.gap, axis: DEF.axis, frame: 'u along heading axis (the way Leaf threads the gap), v to its left (seaward), origin = gap at sea level' },
      marks: {
        ...sky.marks,
        gap: { at: W(0, 0, 9), alias: ['the gap'] }, gapIn: { at: W(-16, 0, 9) }, gapOut: { at: W(16, 0, 9) },
        lowTop: { at: [cW[0], C.H, cW[2]], alias: ['low stack', 'stack C', 'C'] },
        topA: { at: W(S.A.tu, S.A.tv, S.A.H), alias: ['stack A'] }, topB: { at: W(S.B.tu, S.B.tv, S.B.H), alias: ['stack B'] },
      },
      areas: { lowTop: { poly: ring(0, 0, cTop.ru * 0.85, cTop.rv * 0.85, 12, 0, (u, v) => W(cTop.cu + u, cTop.cv + v)), y: C.H, slots: 2 } },
      paths: {
        ...sky.paths,
        'gap-axis': [W(-200, 0, 4.5), W(-30, 0, 6), W(0, 0, 9.5), W(30, 0, 9), W(70, -20, 17)],
        'over-stacks': [W(-60, 0, 48), W(0, 0, 80), W(60, 0, 86), W(94, 5, 40)],
      },
      solids,
      state: { birds: '{ lift: s } shot-local time the seabirds go up (< -6: already wheeling; none: sitting)', shadowAt: '[x, y, z] + shadowExtent (default the rocks)' },
    };
  },

  async VERDOR_AERIAL(spec) {
    const sky = await LAYOUT.SKY_OFF_VERDOR();
    const MAP = spec.map;
    const TR = MAP.terrace, [px, py, pz] = MAP.palace.ground, q0 = MAP.quay.from, q1 = MAP.quay.to;
    // the terraced town ground (builder townG; its 0.4 m noise left out) - for marks only
    const townG = (x) => { const q = Math.max(0, TR.x0 - x) * TR.slope / TR.step, i = Math.floor(q), f = q - i; return MAP.apronY + TR.step * (i + smooth(0.72, 1, f)); };
    const sm = MAP.santaMaria, hy = (sm.heading || 0) * D2R;
    // ship frame (+x bow, rotation y = pi/2 - heading) -> world
    const ship = (x, y, z) => { const a = Math.PI / 2 - hy; return [sm.at[0] + x * Math.cos(a) + z * Math.sin(a), y, sm.at[2] - x * Math.sin(a) + z * Math.cos(a)]; };
    const { NEST, MASTHEAD } = await imp('scenes/lib/director/sets/verdor-aerial-2.js');
    const solids = [
      { poly: obox([sm.at[0], sm.at[2]], 3.2, 11, hy), y0: -2.5, h: 8, what: 'Santa Maria hull' },
      { cyl: [ship(-1.19, 0, 0)[0], ship(-1.19, 0, 0)[2]], r: 0.5, y0: 4, h: 20, what: 'Santa Maria mainmast' },
    ];
    const wall = MAP.harbourWall;
    for (let i = 0; i < wall.length - 1; i++) solids.push({ poly: seg([wall[i][0], wall[i][2]], [wall[i + 1][0], wall[i + 1][2]], 6.5), y0: -16, h: 16 + 3.4, what: 'breakwater' });
    // terrace house rows (builder: one row per terrace facing east, z 1480-1790, lanes between groups; gaps left out)
    for (let i = 0; i < 5; i++) {
      const xBack = TR.x0 - (i + 0.5) * TR.step / TR.slope, y = MAP.apronY + TR.step * i;
      solids.push({ box: [[xBack - 4.5, 1480], [xBack + 4.5, 1790]], y0: y - 0.5, h: 6, what: `terrace ${i} houses`, approx: true });
    }
    solids.push({ cyl: [px, pz], r: 30, y0: py, h: 22, what: 'palace', approx: true });
    solids.push({ box: [[q0[0] - 30, q0[2] + 10], [q0[0] - 9, q1[2] - 10]], y0: 2.6, h: 8, what: 'quay warehouses', approx: true });
    const mk = (x, z, dy = 0) => [x, townG(x) + dy, z];
    return {
      ...sky, _coast: undefined, kind: 'air-harbour-town',
      ground: { type: 'terrain', sea: 0, note: 'sea / harbour basin at y 0; quay apron 2.6-2.8; terraces every 7.5 m rising west of x 230' },
      map: MAP,
      marks: {
        ...sky.marks,
        quay: { at: [MAP.quayX - 4, MAP.apronY, (q0[2] + q1[2]) / 2], approx: true, alias: ['quayside', 'harbor', 'harbour'] },
        santaMaria: { at: [...sm.at], alias: ['Santa Maria', 'ship'] }, palace: { at: [px, py, pz] },
        farm: { at: mk(146, 1846), approx: true, alias: ['terrace farm', 'terraces'] }, school: { at: mk(120, 1985), approx: true, alias: ['riding school'] },
        harbourMouth: { at: [400, 0, 1700], alias: ['harbour mouth', 'harbor mouth'] },
        crowsNest: { at: ship(NEST.x, NEST.y, NEST.z), src: 'verdor-aerial-2 NEST', alias: ["crow's nest", 'masthead'] },
        mainmastTop: { at: ship(...MASTHEAD), src: 'verdor-aerial-2 MASTHEAD' },
      },
      objects: { crowsNest: { at: ship(NEST.x, NEST.y, NEST.z), src: 'verdor-aerial-2' } },
      areas: { quay: { poly: [[MAP.quayX - 8.5, q0[2]], [MAP.quayX, q0[2]], [MAP.quayX, q1[2]], [MAP.quayX - 8.5, q1[2]]], y: 2.8, slots: 12 } },
      paths: {
        ...sky.paths, harbourWall: wall, quay: [[MAP.quayX - 2, 2.8, q0[2]], [MAP.quayX - 2, 2.8, q1[2]]],
        'flight-X4': [[300, 60, 1292], [330, 50, 1450], [360, 40, 1640], [420, 45, 1880], [560, 50, 2600]],
      },
      solids,
      state: { shadowAt: '[x, y, z] + shadowExtent' },
    };
  },

  async VERDOR_HARBOR(spec) {
    const base = await LAYOUT.VERDOR_AERIAL(spec);
    const MAP = spec.map, HB = MAP.harbor || {}, SL = MAP.slipway;
    const slipX0 = SL.at[0] - 3, slipX1 = slipX0 + SL.len, slipZ = SL.at[2];
    const solids = [...base.solids];
    for (const [x, z] of HB.stalls || []) solids.push({ box: [[x - 1.1, z - 0.8], [x + 1.1, z + 0.8]], y0: 2.6, h: 2.3, what: 'market stall', approx: true });
    for (const [[x, z], yaw] of HB.hauled || []) solids.push({ poly: obox([x, z], 0.8, 2.6, yaw * D2R), y0: 2.6, h: 0.9, what: 'hauled boat', approx: true });
    const st = HB.street;
    return {
      ...base, kind: 'ground-harbour',
      ground: { type: 'terrain', sea: 0, note: 'quay paving top 2.8 (x 253.5-262, z 1560-1700); slipway 2.75 -> -1.6 east; the market street on terrace 1' },
      marks: {
        ...base.marks,
        slipwayTop: { at: [slipX0, SL.top, slipZ], alias: ['slipway'] }, slipwayFoot: { at: [slipX1, SL.toe, slipZ] },
        catch: { at: [HB.heap[0], 2.8, HB.heap[1]], alias: ['fish baskets', 'fish heap'] },
        market: { at: [(st.x[0] + st.x[1]) / 2, base.marks.farm.at[1] > 0 ? 10.1 : 10.1, (st.z[0] + st.z[1]) / 2], approx: true, alias: ['market street', 'stalls'] },
      },
      objects: { boatA: { at: null, moves: 'set.boats' }, boatB: { at: null, moves: 'set.boats' }, net: { at: null, moves: 'set.haul' }, shadowDragon: { at: null, moves: 'a dragon\'s shadow caster (fx params.object)' } },
      areas: { ...base.areas, market: { poly: [[st.x[0], st.z[0]], [st.x[1], st.z[0]], [st.x[1], st.z[1]], [st.x[0], st.z[1]]], y: 10.1, slots: 16, approx: true } },
      paths: { ...base.paths, slipway: [[slipX0, SL.top, slipZ], [slipX1, SL.toe, slipZ]], 'market-street': [[(st.x[0] + st.x[1]) / 2, 10.1, st.z[0]], [(st.x[0] + st.x[1]) / 2, 10.1, st.z[1]]] },
      solids,
      state: { boats: '{ boatA: [[t, [x, z], yaw?]], boatB: ... } (actors can ride them: cast parent)', haul: 'the hauled net between the boats + a haul line to a cast member\'s point', shadowAt: '[x, y, z] + shadowExtent' },
    };
  },

  async BIRTHING_CHAMBER(spec) {
    const { NEST_C, EGG } = await imp('scenes/lib/director/sets/birthing-chamber.js');
    const [[bx0, by0, bz0], [bx1, by1, bz1]] = spec.previs.bounds;
    const pm = spec.previs.marks;
    const marks = {};
    for (const [k, v] of Object.entries(pm)) marks[k] = { at: v, src: 'spec previs.marks (the builder\'s marks)' };
    Object.assign(marks.nest, { alias: ['nest', 'frame'] }); Object.assign(marks.egg, { alias: ['the egg'] }); Object.assign(marks.window, { alias: ['high window', 'east window'] });
    return {
      frame: 'VERDOR', kind: 'interior', ground: { type: 'plane', y: 0, note: 'flag floor; the nest\'s linen inside the frame' },
      bounds: [[bx0, by0, bz0], [bx1, by1, bz1]],
      marks,
      objects: { egg: { at: [EGG[0], 0.75, EGG[2]], moves: 'set.egg closed | cracked | opened' }, frag: { at: pm.eggFrag }, door: { at: pm.door, moves: 'set.door (hinge)' }, keyLamp: { at: pm.lampKey }, crack: { at: pm.eggCrack }, waterBowl: { at: null } },
      areas: { floor: { poly: [[bx0 + 0.4, bz0 + 0.4], [bx1 - 0.4, bz0 + 0.4], [bx1 - 0.4, bz1 - 0.4], [bx0 + 0.4, bz1 - 0.4]], y: 0, slots: 6 } },
      paths: { 'door-nest': [pm.doorOut, pm.doorway, [-1.6, 0, 0.4], [NEST_C[0] - 1.4, 0, NEST_C[2] + 0.8]] },
      solids: [
        { cyl: [NEST_C[0], NEST_C[2]], r: 1.3, h: 0.45, what: 'nest frame' },
        { box: [[-1.2, -2.85], [0.4, -2.35]], h: 0.62, what: 'bench', approx: true },
      ],
      state: { egg: 'closed | cracked | opened (+ crack keys)', door: 'open 0..1 keys', lamps: 'continuity lamps 0..1' },
    };
  },
};

// ---- vantages: every hand-written camera (previs-core, t = 0 and the last frame) -------------------------------------
async function vantages(set, specs, rows) {
  const { measure } = await imp('scenes/lib/director/previs-core.js');
  const out = {};
  for (const { file, spec } of specs) {
    for (const id of Object.keys(spec.shots || {})) {
      const row = rows[id] ? { job: id, frames: rows[id].frames_at_24fps, dialogue: rows[id].dialogue || [] } : { job: id, frames: 96, dialogue: [] };
      const sh = spec.shots[id], c = sh.cam || spec.defaults?.cam || {};
      const T = Math.max(0, row.frames / 24 - 1 / 24);
      let a, b;
      try { a = measure(spec, id, 0, { row }); b = measure(spec, id, T, { row }); } catch (e) { a = { skip: e.message }; }
      const v = { rig: c.rig || (c.frame ? 'frame' : 'static'), from: id, spec: file };
      if (a.skip) { v.skip = a.skip; if (c.mount) v.mount = c.mount; out[id] = v; continue; }
      Object.assign(v, { pos: a.cam.pos.toArray(), look: a.cam.look.toArray(), mm: a.cam.mm, fstop: a.cam.fstop });
      if (!b.skip && (b.cam.pos.distanceTo(a.cam.pos) > 0.05 || b.cam.look.distanceTo(a.cam.look) > 0.05)) Object.assign(v, { end: { t: T, pos: b.cam.pos.toArray(), look: b.cam.look.toArray() } });
      if (c.frame) v.solved = true;
      out[id] = v;
    }
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
/** The specs that shoot on a set: its own and any shotSet wrapper's (registry). */
export async function specsFor(set, ep = 's01e01') {
  const { SETS } = await imp('scenes/lib/director/registry.js');
  const keys = Object.keys(SETS).filter((k) => k === set || SETS[k].shotSet === set);
  const out = [];
  for (const k of keys) {
    const f = path.join(dirs(ep).specs, SETS[k].file.replace(/\.js$/, '.spec.js'));
    if (fs.existsSync(f)) out.push({ set: k, file: rel(f), spec: (await import(pathToFileURL(f).href)).default });
  }
  return out;
}

export async function buildSheet(set, ep = 's01e01') {
  if (!LAYOUT[set]) throw new Error(`no sheet recipe for ${set} (known: ${SHEET_SETS.join(', ')})`);
  const { SETS } = await imp('scenes/lib/director/registry.js');
  const specs = await specsFor(set, ep);
  const own = specs.find((s) => s.set === set)?.spec || specs[0]?.spec || {};
  const L = await LAYOUT[set](own);
  const D = dirs(ep);
  const sl = JSON.parse(fs.readFileSync(D.shotlist, 'utf8'));
  const rows = Object.fromEntries(sl.shots.map((r) => [r.id, r]));
  // homes: the specs' (where each actor usually is)
  const homes = {};
  for (const { spec } of specs) for (const [k, v] of Object.entries(spec.homes || {})) homes[k] ??= v;
  // cost: measured draft seconds per frame of this set's shots (cut/timings.json)
  let tm = {};
  try { tm = JSON.parse(fs.readFileSync(path.join(D.cut, 'timings.json'), 'utf8')).shots || {}; } catch { /* none yet */ }
  const ids = sl.shots.filter((r) => r.set === set).map((r) => r.id);
  const spf = ids.map((id) => tm[id]?.draft_s_per_frame).filter((x) => typeof x === 'number');
  const med = median(spf);
  const cost = { shots: ids.length, measured: spf.length, draft_s_per_frame: med, max_s_per_frame: spf.length ? Math.max(...spf) : null, heavy: med != null ? med >= 10 : null, workers: 1, source: rel(path.join(D.cut, 'timings.json')) };
  const solids = L.solids.map((s) => r3(s));
  const areas = {};
  for (const [k, a] of Object.entries(L.areas || {})) areas[k] = { ...a, slotAt: slots(a.poly, a.slots, solids, a.y ?? 0) };
  const reg = SETS[set] || {};
  const sun = {};
  for (const [sc, c] of Object.entries(reg.continuity || {})) sun[sc] = { tod: c.tod, sun: c.sun ? c.sun.map((x) => +x.toFixed(4)) : null };
  const sheet = {
    set, frame: L.frame || reg.frame, kind: L.kind, builder: reg.file ? `scenes/lib/director/sets/${reg.file}` : null,
    specs: specs.map((s) => s.file), generated: 'engine/tools/sheet.mjs (do not edit; re-run it)',
    ground: L.ground, bounds: L.bounds ?? null,
    ...(L.map ? { map: L.map } : {}),
    marks: L.marks, objects: L.objects || {}, homes,
    areas, paths: L.paths || {},
    vantages: await vantages(set, specs, rows),
    solids,
    lines: L.lines || {},
    state: L.state || {},
    continuity: sun,
    cost,
  };
  return r3(sheet);
}

export const sheetPath = (set) => path.join(SHEET_DIR, `${set}.json`);
export const loadSheet = (set) => JSON.parse(fs.readFileSync(sheetPath(set), 'utf8'));
/** A mark (or object / home / vantage aim) of a sheet by name or alias -> [x, y, z] | null (null also for a moving object). */
export function sheetMark(sheet, name) {
  const n = String(name).toLowerCase();
  for (const group of ['marks', 'objects']) {
    for (const [k, m] of Object.entries(sheet[group] || {})) if (k.toLowerCase() === n || (m.alias || []).some((a) => a.toLowerCase() === n)) return { group, name: k, at: m.at };
  }
  if (sheet.homes?.[name]) return { group: 'homes', name, at: sheet.homes[name] };
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const { ep } = episodeArg(argv);
  const i = argv.indexOf('--set');
  const want = i >= 0 ? argv[i + 1] : 'all';
  const sets = want === 'all' ? SHEET_SETS : want.split(',');
  const check = argv.includes('--check');
  let bad = 0;
  for (const set of sets) {
    const text = JSON.stringify(await buildSheet(set, ep), null, 1) + '\n';
    const f = sheetPath(set);
    if (check) {
      const same = fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text;
      if (!same) bad++;
      console.log(`${same ? 'ok   ' : 'STALE'} ${rel(f)}`);
    } else {
      fs.mkdirSync(SHEET_DIR, { recursive: true });
      fs.writeFileSync(f, text);
      const s = JSON.parse(text);
      console.log(`${rel(f)}: ${Object.keys(s.marks).length} marks, ${Object.keys(s.objects).length} objects, ${Object.keys(s.vantages).length} vantages, ${s.solids.length} solids, ${Object.keys(s.areas).length} areas, ${Object.keys(s.paths).length} paths, cost ${s.cost.draft_s_per_frame ?? '-'} s/frame (${s.cost.measured}/${s.cost.shots})`);
    }
  }
  if (bad) process.exit(1);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
