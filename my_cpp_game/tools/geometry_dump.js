#!/usr/bin/env node
/* Dump LE.Shapes output as the reference for tests/test_geometry_parity.cpp.
 *
 *   node tools/geometry_dump.js [out.json]
 *
 * Default output: <my_cpp_game>/build-geometry/geometry_dump.json
 *
 * Every case records the exact argument list it was generated with. Terrain's
 * height function cannot be serialised, so it is named ("waves", "noise") and
 * the C++ test implements the same named function. An empty `args` list means
 * "call with no arguments", which is what exercises the defaults on both sides.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = path.resolve(ROOT, '..', 'site', 'engine', 'legend-engine.js');
const LE = require(BUNDLE);

const out = process.argv[2] || path.join(ROOT, 'build-geometry', 'geometry_dump.json');

/* Named height functions. Keep in sync with heightFnByName() in the test. */
const noise11 = new LE.Noise(11);
const HEIGHT_FNS = {
  flat: () => 0,
  waves: (x, z) => Math.sin(x * 0.15) * 3 + Math.cos(z * 0.1) * 2 + Math.sin((x + z) * 0.05) * 5,
  noise: (x, z) => noise11.fbm(x * 0.03, 0.5, z * 0.03, 5) * 12,
};

/* Non-default arguments are dyadic where possible so a C++ caller passing the
   same literal as float or double lands on the identical value. */
const CASES = [
  ['box', []],
  ['box', [2, 0.5, 1.25, 3]],
  ['box', [0.75, 3, 0.375, 1]],
  ['sphere', []],
  ['sphere', [1.25, 8, 12]],
  ['sphere', [0.5, 3, 5]],
  ['cylinder', []],
  ['cylinder', [0.375, 2.5, 7, false]],
  ['cylinder', [1.5, 0.25, 32, true]],
  ['cone', []],
  ['cone', [0.75, 1.5, 9]],
  ['capsule', []],
  ['capsule', [0.25, 2, 6, 10]],
  ['capsule', [0.5, 0.75, 4, 8]], // height < 2*radius: no cylinder band, equator rows coincide
  ['plane', []],
  ['plane', [4, 6, 5, 3, 0.5]],
  ['torus', []],
  ['torus', [1.5, 0.375, 10, 14]],
  ['terrain', []],
  ['terrain', [40, 16, 'waves', 0.5]],
  ['terrain', [64, 32, 'noise', 0.125]],
  ['rock', []],
  ['rock', [1.25, 42, 3.5]],
  ['rock', [0.75, 0, 1]], // seed 0 -> Rng falls back to seed 1
  ['rock', [0.5, 123456789, 2]],
  ['grassBlade', []],
  ['grassBlade', [1.5, 0.125, 7]],
];

function build(shape, args) {
  if (shape === 'terrain' && args.length) {
    const a = args.slice();
    a[2] = HEIGHT_FNS[a[2]];
    return LE.Shapes.terrain(...a);
  }
  return LE.Shapes[shape](...args);
}

function timeIt(fn) {
  // Warm up, then run for at least ~40 ms to get a stable per-call figure.
  for (let i = 0; i < 3; i++) fn();
  let n = 0;
  const t0 = process.hrtime.bigint();
  let t1 = t0;
  while (n < 5 || Number(t1 - t0) < 40e6) { fn(); n++; t1 = process.hrtime.bigint(); }
  return Number(t1 - t0) / 1e6 / n;
}

const arr = (a) => Array.from(a);

const cases = CASES.map(([shape, args]) => {
  const g = build(shape, args);
  const name = `${shape}(${args.map((x) => JSON.stringify(x)).join(', ')})`;
  return {
    name,
    shape,
    args,
    vertexCount: g.positions.length / 3,
    indexCount: g.indices.length,
    positions: arr(g.positions),
    normals: arr(g.normals),
    uvs: arr(g.uvs),
    indices: arr(g.indices),
    tangents: arr(g.tangents),
    boundsMin: [g.bounds.min.x, g.bounds.min.y, g.bounds.min.z],
    boundsMax: [g.bounds.max.x, g.bounds.max.y, g.bounds.max.z],
    jsMsPerCall: timeIt(() => build(shape, args)),
  };
});

/* Rng / Noise reference values: rock() depends on them bit-for-bit. */
const rngSeeds = [1, 7, 42, 0, 123456789, 4294967295];
const rng = rngSeeds.map((seed) => {
  const r = new LE.Rng(seed);
  const values = [];
  for (let i = 0; i < 16; i++) values.push(r.next());
  return { seed, values };
});
const noisePts = [
  [0, 0, 0], [0.1, 0.2, 0.3], [1.5, -2.25, 3.75], [-7.3, 4.1, 0.5],
  [12.9, -33.3, 101.7], [-0.5, -0.5, -0.5], [2, 2, 2], [300.25, -511.5, 17.125],
];
const noise = [];
for (const seed of [7, 11, 1337, 0]) {
  const n = new LE.Noise(seed);
  for (const p of noisePts) {
    noise.push({ seed, fn: 'noise3', p, v: n.noise3(p[0], p[1], p[2]) });
    noise.push({ seed, fn: 'fbm3', p, v: n.fbm(p[0], p[1], p[2], 3) });
    noise.push({ seed, fn: 'fbm5', p, v: n.fbm(p[0], p[1], p[2], 5) });
  }
}

const doc = {
  meta: { source: 'engine/src/30-geometry.js via site/engine/legend-engine.js', engineVersion: LE.version, node: process.version, generated: new Date().toISOString() },
  rng,
  noise,
  cases,
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc));
let totalV = 0;
for (const c of cases) totalV += c.vertexCount;
console.log(`wrote ${out}: ${cases.length} cases, ${totalV} vertices, ${noise.length} noise samples, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
