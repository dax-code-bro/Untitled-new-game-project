// The map of Calvera: regions, water, and the road graph.
// Coordinates: x = east, z = south, metres. The Gulf coast is the south edge.
import { smoothPath, resample } from '../util.js';

export const WORLD = { half: 2048, size: 4096, res: 1024 }; // heightmap cell = 4 m

export function coastZ(x) {
  return 1480 + 90 * Math.sin(x * 0.0021 + 1.0) + 50 * Math.sin(x * 0.0057 + 2.0);
}

export const CITY = {
  name: 'Port Calvera', x0: 260, z0: 760, nx: 8, nz: 6, pitch: 96, street: 16,
  height: 6, downtown: [640, 1000],
};
export const TOWN = {
  name: 'Mill Creek', x0: -1180, z0: -360, nx: 4, nz: 3, pitch: 72, street: 12,
  height: 0, // set after terrain is generated
};
// Airstrip on the plains (flattened and paved by the heightmap)
export const AIRFIELD = { name: 'Redgrass Airfield', x0: 880, x1: 1500, z: -440, w: 34, height: 0 };
export const LAKE = { name: 'Lake Arden', x: -250, z: -1150, r: 330, level: 0 };

export function lakeRadius(angle) {
  return LAKE.r * (1 + 0.13 * Math.sin(3 * angle + 1) + 0.07 * Math.sin(5 * angle + 0.3));
}

export const FOREST = { x: -1350, z: -1300, r: 760 };
export const PLAINS = { x: 1150, z: -700, r: 800 };
export const BAYOU = { x: -1350, z: 1150, r: 480 };

// Named regions for the on-screen banner (checked in order, first hit wins).
export const REGIONS = [
  { name: 'Port Calvera', sub: 'City', test: (x, z) => x > CITY.x0 - 40 && x < CITY.x0 + CITY.nx * CITY.pitch + 40 && z > CITY.z0 - 40 && z < coastZ(x) },
  { name: 'Mill Creek', sub: 'Town', test: (x, z) => Math.hypot(x - (TOWN.x0 + 144), z - (TOWN.z0 + 108)) < 260 },
  { name: 'Lake Arden', sub: 'Lake', test: (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.5 },
  { name: 'Bayou Verde', sub: 'Wetlands & creeks', test: (x, z) => Math.hypot(x - BAYOU.x, z - BAYOU.z) < BAYOU.r },
  { name: 'Gulf Shore', sub: 'Coast', test: (x, z) => z > coastZ(x) - 120 },
  { name: 'Pinewood Hollow', sub: 'Dense forest', test: (x, z) => Math.hypot(x - FOREST.x, z - FOREST.z) < FOREST.r },
  { name: 'Redgrass Airfield', sub: 'Airstrip', test: (x, z) => x > AIRFIELD.x0 - 80 && x < AIRFIELD.x1 + 80 && Math.abs(z - AIRFIELD.z) < 150 },
  { name: 'Redgrass Plains', sub: 'Open hunting land', test: (x, z) => Math.hypot(x - PLAINS.x, z - PLAINS.z) < PLAINS.r },
  { name: 'Sierra Norte', sub: 'Hills', test: (x, z) => z < -1500 },
  // the neighbourhoods around the city (walk-ups, houses, the poor end of town)
  { name: 'Calvera Outskirts', sub: 'Edge of the city', test: (x, z) => Math.hypot(Math.max(CITY.x0 - x, 0, x - CITY.x0 - CITY.nx * CITY.pitch), Math.max(CITY.z0 - z, 0, z - CITY.z0 - CITY.nz * CITY.pitch)) < 430 },
  // only near the river itself (it used to be the name for everywhere without one)
  { name: 'Calvera River', sub: 'River valley', test: (x, z) => { const P = CHANNELS[0].pts; for (let i = 0; i < P.length; i += 3) if (Math.hypot(P[i][0] - x, P[i][1] - z) < 360) return true; return false; } },
  { name: 'Calvera County', sub: 'Open country', test: () => true },
];
export function regionAt(x, z) {
  for (const r of REGIONS) if (r.test(x, z)) return r;
  return REGIONS[REGIONS.length - 1];
}

// Water channels. `end` is the water level the channel flows into.
export const CHANNELS = [
  { name: 'Calvera River', width: 26, depth: 4.5, bank: 34, end: 'sea', fromLake: true,
    ctrl: [[-250, -800], [-320, -560], [-180, -300], [-260, -60], [-120, 200], [-60, 460], [-180, 700], [-90, 960], [-110, 1250], [-60, 1750]] },
  { name: 'Bayou Creek', width: 9, depth: 1.8, bank: 14, end: 'sea',
    ctrl: [[-1500, 640], [-1420, 880], [-1530, 1100], [-1440, 1320], [-1500, 1720]] },
  { name: 'Cypress Creek', width: 8, depth: 1.6, bank: 12, end: 'sea',
    ctrl: [[-1080, 820], [-1180, 1000], [-1070, 1200], [-1150, 1720]] },
  { name: 'Pine Run', width: 7, depth: 1.5, bank: 12, end: 'lake',
    ctrl: [[-1150, -1560], [-880, -1380], [-700, -1260], [-560, -1180]] },
];
for (const c of CHANNELS) c.pts = smoothPath(c.ctrl, 8);

// ---------------------------------------------------------------- road graph
export function buildRoadGraph() {
  const nodes = new Map();
  const edges = [];
  const node = (id, x, z) => {
    if (!nodes.has(id)) nodes.set(id, { id, x, z, edges: [] });
    return nodes.get(id);
  };
  const addEdge = (a, b, pts, kind, width) => {
    const e = { id: edges.length, a: a.id, b: b.id, pts, kind, width, speed: kind === 'highway' ? 25 : 13 };
    edges.push(e);
    a.edges.push(e.id);
    b.edges.push(e.id);
    return e;
  };
  const grid = (G, prefix, kind) => {
    for (let i = 0; i <= G.nx; i++)
      for (let j = 0; j <= G.nz; j++) node(`${prefix}${i}_${j}`, G.x0 + i * G.pitch, G.z0 + j * G.pitch);
    for (let i = 0; i <= G.nx; i++)
      for (let j = 0; j <= G.nz; j++) {
        const n = nodes.get(`${prefix}${i}_${j}`);
        if (i < G.nx) {
          const m = nodes.get(`${prefix}${i + 1}_${j}`);
          addEdge(n, m, resample([[n.x, n.z], [m.x, m.z]], 8), kind, G.street);
        }
        if (j < G.nz) {
          const m = nodes.get(`${prefix}${i}_${j + 1}`);
          addEdge(n, m, resample([[n.x, n.z], [m.x, m.z]], 8), kind, G.street);
        }
      }
  };
  grid(CITY, 'c', 'street');
  grid(TOWN, 't', 'street');


  const hw = (fromId, ctrl, toId) => {
    const a = nodes.get(fromId);
    const pts = smoothPath([[a.x, a.z], ...ctrl, ...(toId ? [[nodes.get(toId).x, nodes.get(toId).z]] : [])], 8);
    const last = pts[pts.length - 1];
    const b = toId ? nodes.get(toId) : node(`end_${edges.length}`, last[0], last[1]);
    return addEdge(a, b, pts, 'highway', 12);
  };
  // Route 9: city -> Mill Creek
  hw('c0_2', [[120, 935], [-100, 860], [-400, 690], [-700, 420], [-900, 120], [-1010, -60]], 't2_3');
  // Route 41: Mill Creek -> Lake Arden -> north shore
  hw('t1_0', [[-1110, -520], [-900, -800], [-720, -1020], [-640, -1450], [-450, -1620], [-150, -1640], [120, -1540]], null);
  // Route 17: city -> Redgrass Plains
  hw('c5_0', [[760, 600], [900, 300], [1150, 0], [1300, -400], [1360, -800], [1260, -1200], [1000, -1500]], null);
  // Coast Highway: city -> Bayou Verde
  hw('c0_5', [[100, 1290], [-150, 1310], [-500, 1265], [-850, 1250], [-1250, 1215], [-1700, 1120]], null);
  // Mill Creek -> forest logging road
  hw('t0_1', [[-1350, -300], [-1500, -600], [-1550, -950], [-1400, -1200]], null);

  // Outer neighbourhoods north and east of Port Calvera. Residential streets run out
  // from the city edge (between the shops on the edge strip) to an outer street, so
  // the city fades out into walk-ups, then houses, then the poor end of town on every
  // side, not only along the highways. (The west already has Route 9 and the Coast
  // Highway; the south is the port.) Flagged `lane` so the older outskirts generator
  // keeps placing exactly what it always did (saved homes stay where they are).
  const lane = (a, b, w = 10) => { const e = addEdge(a, b, resample([[a.x, a.z], [b.x, b.z]], 8), 'street', w); e.lane = true; return e; };
  const o = (id, x, z) => node('o_' + id, x, z);
  const C = (i, j) => nodes.get(`c${i}_${j}`);
  const zN = CITY.z0 - 170, xE = CITY.x0 + CITY.nx * CITY.pitch + 170;
  const n1 = o('n1', C(1, 0).x, zN), n4 = o('n4', C(4, 0).x, zN), nw = o('nw', CITY.x0 - 70, zN);
  const n6 = o('n6', C(6, 0).x, CITY.z0 - 160), n7 = o('n7', C(7, 0).x, CITY.z0 - 160), ne = o('ne', xE, CITY.z0 - 160);
  const e1 = o('e1', xE, C(CITY.nx, 1).z), e4 = o('e4', xE, C(CITY.nx, 4).z);
  lane(C(1, 0), n1); lane(C(4, 0), n4); lane(nw, n1); lane(n1, n4);
  lane(C(6, 0), n6); lane(C(7, 0), n7); lane(n6, n7); lane(n7, ne);
  lane(C(CITY.nx, 1), e1); lane(C(CITY.nx, 4), e4); lane(ne, e1); lane(e1, e4);

  return { nodes, edges };
}
