// Offline bake for the prologue island: erosion-shaped heightmap (stream power -> droplets ->
// thermal), then the lava-flow terracing.
//
//   node scenes/lib/nature/offline/bake-island.mjs [--drops 1200000] [--preview out.ppm]
//
// Writes scenes/lib/nature/cache/island/island.dkhm (git-ignored) with layers flow / wear / dep.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIslandWorld } from '../island-world.js';
import { erodeHydraulic, erodeThermal, flowAccumulation, erodeStreamPower } from './erosion.mjs';
import { encodeHeightmap } from '../heightmap.js';
import { smoothstep } from '../noise.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'cache', 'island');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DROPS = +arg('--drops', 1200000);
const PREVIEW = arg('--preview', null);

const t0 = Date.now();
const W = createIslandWorld();
const { cx, cz } = W.I, { half: [hx, hz], cell } = W.I.grid;
const X0 = cx - hx, Z0 = cz - hz;
const nx = Math.round((2 * hx) / cell) + 1, nz = Math.round((2 * hz) / cell) + 1;
const h = new Float32Array(nx * nz), base = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; h[k] = base[k] = W.base(X0 + i * cell, Z0 + j * cell); }
console.log(`[island] grid ${nx} x ${nz} (${cell} m)`);
const land = (i, j) => smoothstep(0, 6, h[j * nx + i]);
erodeStreamPower(h, nx, nz, { cell, iterations: +arg('--sp', 50), K: +arg('--K', 0.012), m: 0.5, D: 0.4,
  outlet: (i, j) => base[j * nx + i] < 1, erodible: land,
  onProgress: (f) => process.stdout.write(`\r[island] stream power ${(f * 100).toFixed(0)}%   `) });
process.stdout.write('\n');
erodeHydraulic(h, nx, nz, { cell, drops: DROPS, seed: 3, radius: 3, capacity: 8, erode: 0.4, deposit: 0.2, evaporate: 0.01, inertia: 0.06, maxSteps: 120, mask: land,
  onProgress: (f) => process.stdout.write(`\r[island] hydraulic ${(f * 100).toFixed(0)}%   `) });
process.stdout.write('\n');
erodeThermal(h, nx, nz, { cell, talus: 1.1, iterations: 20, rate: 0.3, mask: land });
// lava-flow terracing on the eroded surface (benches and scarps follow the flows across gullies)
const out = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const k = j * nx + i;
  const gx = (h[k + (i < nx - 1 ? 1 : 0)] - h[k - (i > 0 ? 1 : 0)]) / (2 * cell), gz = (h[k + (j < nz - 1 ? nx : 0)] - h[k - (j > 0 ? nx : 0)]) / (2 * cell);
  out[k] = W.terrace(X0 + i * cell, Z0 + j * cell, h[k], Math.hypot(gx, gz));
}
const wear = new Uint8Array(nx * nz), dep = new Uint8Array(nx * nz), flow = new Uint8Array(nx * nz);
for (let k = 0; k < nx * nz; k++) { const d = h[k] - base[k]; wear[k] = Math.min(255, Math.max(0, -d) * 10); dep[k] = Math.min(255, Math.max(0, d) * 20); }
const acc = flowAccumulation(out, nx, nz);
for (let k = 0; k < nx * nz; k++) flow[k] = Math.min(255, Math.log2(acc[k]) * 18);
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'island.dkhm');
fs.writeFileSync(file, encodeHeightmap({ x0: X0, z0: Z0, cell, nx, nz }, out, [{ name: 'flow', data: flow }, { name: 'wear', data: wear }, { name: 'dep', data: dep }]));
console.log(`[island] wrote ${file} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (PREVIEW) {
  const buf = Buffer.alloc(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, r = (nz - 1 - j) * nx + i;
    const ax = (out[k + (i < nx - 1 ? 1 : 0)] - out[k - (i > 0 ? 1 : 0)]) / (2 * cell), az = (out[k + (j < nz - 1 ? nx : 0)] - out[k - (j > 0 ? nx : 0)]) / (2 * cell);
    const l = Math.hypot(ax, 1, az), s = Math.max(0, (-ax * -0.5 + 0.7 - az * 0.5) / l);
    const c = out[k] < 0 ? [20, 40, 70] : [60 + 160 * s, 70 + 150 * s, 55 + 120 * s];
    buf[r * 3] = c[0]; buf[r * 3 + 1] = c[1]; buf[r * 3 + 2] = c[2];
  }
  fs.writeFileSync(PREVIEW, Buffer.concat([Buffer.from(`P6 ${nx} ${nz} 255\n`), buf]));
}
