// Offline bake for the land around Cling: rolling farmland shaped by stream-power + droplet
// erosion (gentle: valleys and dry combes, not gullies), the town shelf kept level.
//
//   node scenes/lib/nature/offline/bake-cling.mjs [--drops 500000]
//
// Writes scenes/lib/nature/cache/cling/cling.dkhm (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClingWorld, CLING_LAND } from '../cling-world.js';
import { erodeHydraulic, erodeThermal, flowAccumulation, erodeStreamPower } from './erosion.mjs';
import { encodeHeightmap } from '../heightmap.js';
import { smoothstep } from '../noise.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'cache', 'cling');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const t0 = Date.now();
const W = createClingWorld();
const { x: [X0, X1], z: [Z0, Z1], cell } = CLING_LAND;
const nx = Math.round((X1 - X0) / cell) + 1, nz = Math.round((Z1 - Z0) / cell) + 1;
const h = new Float32Array(nx * nz), base = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; h[k] = base[k] = W.base(X0 + i * cell, Z0 + j * cell); }
const border = (i, j) => Math.min(smoothstep(0, 40, Math.min(i, nx - 1 - i)), smoothstep(0, 40, Math.min(j, nz - 1 - j)));
const er = (i, j) => smoothstep(140, 260, Math.hypot(X0 + i * cell, Z0 + j * cell)) * border(i, j);
erodeStreamPower(h, nx, nz, { cell, iterations: 50, K: 0.004, m: 0.5, D: 0.8, erodible: er,
  onProgress: (f) => process.stdout.write(`\r[cling] stream power ${(f * 100).toFixed(0)}%   `) });
process.stdout.write('\n');
erodeHydraulic(h, nx, nz, { cell, drops: +arg('--drops', 500000), seed: 9, radius: 4, capacity: 4, erode: 0.25, deposit: 0.3, evaporate: 0.015, inertia: 0.1, maxSteps: 90, mask: er,
  onProgress: (f) => process.stdout.write(`\r[cling] hydraulic ${(f * 100).toFixed(0)}%   `) });
process.stdout.write('\n');
erodeThermal(h, nx, nz, { cell, talus: 0.6, iterations: 15, rate: 0.3, mask: er });
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, b = er(i, j); h[k] = base[k] + (h[k] - base[k]) * Math.min(1, b * 1.5); }
const acc = flowAccumulation(h, nx, nz);
const flow = new Uint8Array(nx * nz);
for (let k = 0; k < nx * nz; k++) flow[k] = Math.min(255, Math.log2(acc[k]) * 18);
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'cling.dkhm');
fs.writeFileSync(file, encodeHeightmap({ x0: X0, z0: Z0, cell, nx, nz }, h, [{ name: 'flow', data: flow }]));
console.log(`[cling] wrote ${file} (${nx} x ${nz}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
