// Engine set generator (engine/setgen, DESIGN.md section 4) - the INTERIOR-ROOM layout, pure (no three.js):
// the same function lays the room out in the browser (sets/gen/interior-room.js builds it) and in Node
// (engine/setgen/templates/interior-room.mjs writes the set sheet's marks, solids, paths and vantages
// from it), so a sheet mark can never drift from the built room.
//
// Room frame: the floor centre at the origin, y up, -z = NORTH, +x = EAST (the alexandria-room / palace-
// corridor pattern). Inner wall faces at x = +-w/2, z = +-d/2. A wall's along-coordinate s runs the way
// its masonry face runs (east: north -> south, south: east -> west, west: south -> north, north: west -> east).
//
// P (the generated wrapper's PARAMS): { w, d, h, T, seed, stone: 'washed' | 'rubble',
//   door: { wall, at?, w?, h? }, window: { wall, at?, w?, y?, h? } | null, items: [{ kind, wall?, place?, n? }],
//   lamps: n }   (at: 0..1 along the wall, default: a free place)
export const WALLS = ['north', 'east', 'south', 'west'];
export const IN = { north: [0, 1], south: [0, -1], east: [-1, 0], west: [1, 0] };   // (x, z) into the room
export const YAW = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 };  // a thing on the wall facing in
// item sizes [along the wall, height, depth from the wall] and how they sit
export const ITEMS = {
  oven: { size: [1.7, 1.45, 1.25], wall: true, stand: 0.6, label: 'a domed bread oven (stone, a fire in its mouth)' },
  hearth: { size: [1.6, 1.25, 0.7], wall: true, stand: 0.6, label: 'an open hearth with a fire' },
  counter: { size: [2.4, 0.95, 0.7], wall: false, stand: 0.55, label: 'a plank counter on trestles' },
  table: { size: [1.6, 0.76, 0.85], wall: false, stand: 0.55, label: 'a plank table' },
  bench: { size: [1.6, 0.46, 0.38], wall: true, stand: 0.45, label: 'a plank bench' },
  shelf: { size: [1.6, 0.05, 0.3], wall: true, y: 1.45, stand: 0.6, label: 'a wall shelf with bowls' },
  bed: { size: [1.45, 0.6, 2.05], wall: true, stand: 0.55, label: 'a joined oak bed' },
  barrel: { size: [0.6, 0.82, 0.6], wall: true, stand: 0.5, label: 'a barrel' },
  sack: { size: [0.5, 0.75, 0.5], wall: true, stand: 0.5, label: 'a flour sack' },
  crate: { size: [0.7, 0.5, 0.5], wall: true, stand: 0.5, label: 'a crate' },
  stool: { size: [0.4, 0.42, 0.4], wall: false, stand: 0.45, label: 'a stool' },
};

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
export const wallLen = (L, wall) => (wall === 'east' || wall === 'west' ? L.d : L.w);
/** The point s along a wall's inner face, `inset` metres into the room: [x, z]. */
export function wallPoint(L, wall, s, inset = 0) {
  const { w, d } = L;
  if (wall === 'east') return [w / 2 - inset, -d / 2 + s];
  if (wall === 'south') return [w / 2 - s, d / 2 - inset];
  if (wall === 'west') return [-w / 2 + inset, d / 2 - s];
  return [-w / 2 + s, -d / 2 + inset];
}
const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' };

/** The whole layout: openings, items, lamps, marks, solids, bounds, areas, paths, vantages. Deterministic. */
export function roomLayout(P) {
  const L = { w: +P.w, d: +P.d, h: +P.h, T: P.T ?? 0.6 };
  const used = Object.fromEntries(WALLS.map((k) => [k, []]));        // [s0, s1] taken along each wall
  const free = (wall, s0, s1) => s0 >= 0.15 && s1 <= wallLen(L, wall) - 0.15 && !used[wall].some(([a, b]) => s1 > a - 0.05 && s0 < b + 0.05);
  // the free spot nearest the preferred fraction (0..1) of the wall for a width `len`
  const place = (wall, len, pref = 0.5) => {
    const W = wallLen(L, wall);
    const cands = [];
    for (let s = 0.15; s + len <= W - 0.15 + 1e-9; s += 0.05) if (free(wall, s, s + len)) cands.push(s);
    if (!cands.length) return null;
    const want = pref * W - len / 2;
    return cands.sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b)[0];
  };
  const take = (wall, s0, s1) => used[wall].push([s0, s1]);
  // openings first (they never move); a window on the door's wall keeps clear of it
  const D = P.door || { wall: 'south' };
  const door = { wall: D.wall, w: D.w ?? 1.0, h: D.h ?? 2.15 };
  // no `at`: toward the window's side (one corner view then sees the door and the window), else 0.7
  let dPref = 0.7;
  if (P.window && P.window.wall !== D.wall && opposite[P.window.wall] !== D.wall) {
    const [x0, z0] = wallPoint(L, D.wall, 0), [x1, z1] = wallPoint(L, D.wall, wallLen(L, D.wall));
    const towards = (x, z) => (IN[P.window.wall][0] ? -IN[P.window.wall][0] * x : -IN[P.window.wall][1] * z);
    dPref = towards(x0, z0) > towards(x1, z1) ? 0.3 : 0.7;
  } else if (P.window?.wall === D.wall) dPref = 0.22;
  door.s0 = r2(D.at != null ? D.at * wallLen(L, door.wall) - door.w / 2 : place(door.wall, door.w, dPref));
  take(door.wall, door.s0 - 0.25, door.s0 + door.w + 0.25);
  let win = null;
  if (P.window) {
    win = { wall: P.window.wall, w: P.window.w ?? 1.1, y: P.window.y ?? 0.95, h: P.window.h ?? 1.35 };
    win.s0 = r2(P.window.at != null ? P.window.at * wallLen(L, win.wall) - win.w / 2 : place(win.wall, win.w, 0.5));
    take(win.wall, win.s0 - 0.2, win.s0 + win.w + 0.2);
  }
  L.door = door; L.window = win;
  const items = [];
  const counts = {};
  for (const it of P.items || []) {
    const def = ITEMS[it.kind];
    if (!def) continue;
    for (let k = 0; k < (it.n || 1); k++) {
      const [sx, sy, sz] = def.size;
      const name = counts[it.kind] ? `${it.kind}${counts[it.kind] + 1}` : it.kind;
      counts[it.kind] = (counts[it.kind] || 0) + 1;
      if (def.wall || it.wall) {
        // against a wall: the asked wall, else the wall opposite the door, then the others
        const order = [it.wall, opposite[door.wall], ...WALLS].filter((x, i, a) => x && a.indexOf(x) === i);
        let wall = null, s0 = null;
        for (const wl of order) { const s = place(wl, sx, it.at ?? (k ? 0.2 + 0.6 * (k % 2) : 0.5)); if (s != null) { wall = wl; s0 = s; break; } }
        if (wall == null) continue;
        take(wall, s0, s0 + sx);
        const [x, z] = wallPoint(L, wall, s0 + sx / 2, sz / 2 + 0.02);
        items.push({ kind: it.kind, name, wall, s: r2(s0 + sx / 2), at: [r3(x), def.y ?? 0, r3(z)], yaw: YAW[wall], size: def.size });
      } else {
        // free-standing: "across the middle" (the counter: along the room's long side, its front toward the door)
        const along = L.w >= L.d ? 'x' : 'z';
        const span = along === 'x' ? L.w : L.d;
        const len = it.kind === 'counter' ? Math.min(2.6, Math.max(1.4, span * 0.5)) : sx;
        // a little toward the door: the far side stays clear for whoever works behind it
        const off = (along === 'x' ? -IN[door.wall][1] : -IN[door.wall][0]) * Math.min(0.35, (along === 'x' ? L.d : L.w) * 0.07);
        const idx = items.filter((x) => !x.wall).length;
        const shift = idx ? (idx % 2 ? 1 : -1) * Math.min(1.2, (along === 'x' ? L.d : L.w) * 0.25) : 0;
        const at = along === 'x' ? [0, 0, off + shift] : [off + shift, 0, 0];
        // the front faces the door: yaw so local +z points toward the door's side
        const dIn = IN[door.wall];
        const yaw = along === 'x' ? (dIn[1] < 0 ? 0 : dIn[1] > 0 ? Math.PI : 0) : (dIn[0] < 0 ? -Math.PI / 2 : Math.PI / 2);
        items.push({ kind: it.kind, name, wall: null, at: at.map(r3), yaw: r3(yaw), size: [r2(len), sy, sz] });
      }
    }
  }
  L.items = items;
  // lamps: on the walls' free stretches, 1.9 m up (the side walls first)
  const lamps = [];
  const lampWalls = [...WALLS.filter((x) => x !== door.wall && x !== win?.wall), win?.wall, door.wall].filter(Boolean);
  for (let k = 0; k < (P.lamps || 0); k++) {
    const wall = lampWalls[k % lampWalls.length];
    const s = place(wall, 0.3, k < lampWalls.length ? 0.5 : 0.25);
    if (s == null) continue;
    take(wall, s, s + 0.3);
    const [x, z] = wallPoint(L, wall, s + 0.15, 0.36);
    lamps.push({ wall, s: r2(s + 0.15), y: 1.9, at: [r3(x), 1.96, r3(z)] });
  }
  L.lamps = lamps;

  // ---- marks (the sheet's and the builder's): [x, y, z]
  const M = {};
  const mark = (k, at, alias = [], extra = {}) => { M[k] = { at: at.map(r3), alias, ...extra }; };
  const dmid = door.s0 + door.w / 2;
  const [dx, dz] = wallPoint(L, door.wall, dmid, 0);
  const [ox, oz] = wallPoint(L, door.wall, dmid, -0.9);
  const [ix, iz] = wallPoint(L, door.wall, dmid, 0.75);
  mark('doorFrame', [dx, 1.3, dz], ['door frame', 'door leaf']);                       // the opening in the wall (a look target)
  mark('doorway', [ox, 0, oz], ['outside', 'street', 'outside the door'], { outside: true });   // the street (a walk-in starts here)
  mark('door', [ix, 0, iz], ['the door', 'entrance', 'inside the door', 'threshold', `${door.wall} door`]);   // where one stands at the door, inside
  if (win) {
    const wm = win.s0 + win.w / 2;
    const [wx, wz] = wallPoint(L, win.wall, wm, 0);
    const [vx, vz] = wallPoint(L, win.wall, wm, 0.65);
    const [fx, fz] = wallPoint(L, win.wall, wm, -20);
    mark('window', [wx, win.y + win.h / 2, wz], ['window', 'the window', `${win.wall} window`]);
    mark('windowIn', [vx, 0, vz], ['at the window', 'by the window']);
    mark('windowOut', [fx, 0, fz], ['view', 'out of the window'], { outside: true });   // what the window looks at
  }
  const front = (it, dist) => {
    const yaw = it.yaw, fz = Math.cos(yaw), fx = Math.sin(yaw);
    return [it.at[0] + fx * dist, 0, it.at[2] + fz * dist];
  };
  for (const it of items) {
    const top = it.kind === 'shelf' ? it.at[1] + 0.1 : it.size[1];
    // the item's NAME is where one stands to use it (a place word in an action walks there); <name>Top is the thing itself
    const st = ITEMS[it.kind].stand;
    mark(it.name, front(it, it.size[2] / 2 + st), it.name === it.kind ? [`the ${it.kind}`, `at the ${it.kind}`, `in front of the ${it.kind}`] : []);
    mark(`${it.name}Top`, [it.at[0], top, it.at[2]], it.name === it.kind ? [`on the ${it.kind}`, `${it.kind} top`] : []);
    if (!it.wall) mark(`${it.name}Back`, front(it, -(it.size[2] / 2 + st)), it.name === it.kind ? [`behind the ${it.kind}`, `${it.kind} back`] : []);
  }
  lamps.forEach((l, i) => mark(`lamp${i + 1}`, l.at, i ? [] : ['lamp', 'oil lamp']));
  mark('centre', [0, 0, 0], ['middle', 'center', 'room']);
  L.marks = M;

  // ---- solids (previs occlusion; footprints in x/z), the walls as thin slabs just outside the room
  const solids = [];
  for (const it of items) {
    if (it.kind === 'shelf') continue;
    const c = Math.abs(Math.cos(it.yaw)), s = Math.abs(Math.sin(it.yaw));
    const hx = (it.size[0] * c + it.size[2] * s) / 2, hz = (it.size[0] * s + it.size[2] * c) / 2;
    solids.push({ box: [[r3(it.at[0] - hx), r3(it.at[2] - hz)], [r3(it.at[0] + hx), r3(it.at[2] + hz)]], h: r2(it.at[1] + it.size[1]), what: it.name });
  }
  const { w, d, h, T } = L;
  solids.push({ box: [[-w / 2 - T, -d / 2 - T], [w / 2 + T, -d / 2]], h, what: 'north wall' });
  solids.push({ box: [[-w / 2 - T, d / 2], [w / 2 + T, d / 2 + T]], h, what: 'south wall' });
  solids.push({ box: [[w / 2, -d / 2], [w / 2 + T, d / 2]], h, what: 'east wall' });
  solids.push({ box: [[-w / 2 - T, -d / 2], [-w / 2, d / 2]], h, what: 'west wall' });
  L.solids = solids;
  L.bounds = [[r2(-w / 2 + 0.12), 0.15, r2(-d / 2 + 0.12)], [r2(w / 2 - 0.12), r2(h - 0.15), r2(d / 2 - 0.12)]];
  // free floor slots (0.5 m grid points clear of every item and 0.4 m from the walls)
  const inSolid = (x, z, m = 0.3) => solids.slice(0, solids.length - 4).some((sd) => x > sd.box[0][0] - m && x < sd.box[1][0] + m && z > sd.box[0][1] - m && z < sd.box[1][1] + m);
  const slots = [];
  for (let x = -w / 2 + 0.5; x <= w / 2 - 0.5 + 1e-9; x += 0.6) for (let z = -d / 2 + 0.5; z <= d / 2 - 0.5 + 1e-9; z += 0.6) if (!inSolid(x, z)) slots.push([r3(x), 0, r3(z)]);
  L.areas = { floor: { poly: [[-w / 2 + 0.4, -d / 2 + 0.4], [w / 2 - 0.4, -d / 2 + 0.4], [w / 2 - 0.4, d / 2 - 0.4], [-w / 2 + 0.4, d / 2 - 0.4]], y: 0, slots: slots.length, slotAt: slots } };
  // walk paths from the door to every standing mark (around a free-standing item that is in the way)
  const crosses = (a, b, sd) => {
    for (let k = 1; k < 20; k++) { const u = k / 20, x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u; if (x > sd.box[0][0] - 0.25 && x < sd.box[1][0] + 0.25 && z > sd.box[0][1] - 0.25 && z < sd.box[1][1] + 0.25) return true; }
    return false;
  };
  const route = (a, b) => {
    const pts = [a];
    const blocker = solids.slice(0, solids.length - 4).find((sd) => crosses(a, b, sd));
    if (blocker) {
      // round the nearer end of the blocker: two corners (the near side, then the far side), inside the room
      const [[x0, z0], [x1, z1]] = blocker.box, m = 0.45;
      const opts = [];
      for (const ex of [x0 - m, x1 + m]) opts.push([[ex, a[2] < (z0 + z1) / 2 ? z0 - m : z1 + m], [ex, b[2] < (z0 + z1) / 2 ? z0 - m : z1 + m]]);
      for (const ez of [z0 - m, z1 + m]) opts.push([[a[0] < (x0 + x1) / 2 ? x0 - m : x1 + m, ez], [b[0] < (x0 + x1) / 2 ? x0 - m : x1 + m, ez]]);
      const inside = ([x, z]) => Math.abs(x) < w / 2 - 0.3 && Math.abs(z) < d / 2 - 0.3;
      const len = (q) => { let t = 0, p = a; for (const c of [...q.map(([x, z]) => [x, 0, z]), b]) { t += Math.hypot(c[0] - p[0], c[2] - p[2]); p = c; } return t; };
      const clear = (q) => { const c = [a, ...q.map(([x, z]) => [x, 0, z]), b]; return c.slice(1).every((p, i) => !crosses(c[i], p, blocker)); };
      const ok = opts.filter((q) => q.every(inside) && clear(q)).sort((p, q) => len(p) - len(q));
      if (ok.length) for (const [x, z] of ok[0]) if (!pts.some((p) => Math.abs(p[0] - x) < 0.05 && Math.abs(p[2] - z) < 0.05)) pts.push([x, 0, z]);
    }
    pts.push(b);
    return pts.map((p) => [r3(p[0]), 0, r3(p[2])]);
  };
  const paths = {};
  for (const k of [...items.flatMap((it) => (it.kind === 'shelf' ? [] : [it.name, ...(it.wall ? [] : [`${it.name}Back`])])), ...(M.windowIn ? ['windowIn'] : [])]) paths[`door-${k}`] = route(M.doorway.at, M[k].at).slice(0, 1).concat(route(M.door.at, M[k].at));
  L.paths = paths;
  // vantages: one per wall (against it, looking across the room) and one per corner (looking at the far corner)
  const V = {};
  const eye = 1.6;
  for (const wall of WALLS) {
    const W = wallLen(L, wall);
    const [px, pz] = wallPoint(L, wall, W / 2, 0.3);
    const [lx, lz] = wallPoint(L, opposite[wall], wallLen(L, opposite[wall]) / 2, 0.3);
    V[`${wall} wall`] = { rig: 'static', pos: [r3(px), eye, r3(pz)], look: [r3(lx), 1.2, r3(lz)], mm: 24, from: 'engine/setgen (generated vantage)', alias: [`from the ${wall} wall`, wall] };
  }
  const corners = { 'north-west': [-1, -1], 'north-east': [1, -1], 'south-east': [1, 1], 'south-west': [-1, 1] };
  for (const [k, [sx, sz]] of Object.entries(corners)) {
    V[`${k} corner`] = { rig: 'static', pos: [r3(sx * (w / 2 - 0.4)), 1.75, r3(sz * (d / 2 - 0.4))], look: [r3(-sx * w / 4), 1.0, r3(-sz * d / 4)], mm: 24, from: 'engine/setgen (generated vantage)', alias: [k, `${k.replace('-', ' ')} corner`] };
  }
  L.vantages = V;
  return L;
}

/** Sun direction (toward the sun) from azimuth / elevation in degrees (0 = north, 90 = east): registry.js sunDir. */
export function sunDirOf(az, el) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return [r3(Math.sin(a) * Math.cos(e)), r3(Math.sin(e)), r3(-Math.cos(a) * Math.cos(e))];
}
