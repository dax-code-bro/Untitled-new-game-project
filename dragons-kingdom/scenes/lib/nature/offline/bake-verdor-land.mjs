// Offline bake 1/2 for the Verdor coast: the land heightmap, shaped by hydraulic + thermal erosion.
//
//   node scenes/lib/nature/offline/bake-verdor-land.mjs [--drops 1600000] [--preview out.ppm]
//
// Writes scenes/lib/nature/cache/verdor/land.dkhm (git-ignored): heights (4 m grid over the
// land behind the coast) + layers: flow (log drainage area: streams, wet hollows), wear (how much
// erosion removed: bare gullies), dep (deposition: alluvial fans, valley floors).
// Erosion fades out toward the edges of the grid, so the baked land joins the unbaked far land
// (verdor-world.js baseLand) without a step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerdorWorld, VERDOR } from '../verdor-world.js';
import { erodeHydraulic, erodeThermal, flowAccumulation, erodeStreamPower } from './erosion.mjs';
import { encodeHeightmap } from '../heightmap.js';
import { smoothstep } from '../noise.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'cache', 'verdor');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DROPS = +arg('--drops', 1600000);
const PREVIEW = arg('--preview', null);

const t0 = Date.now();
const W = createVerdorWorld();
const { x: [X0, X1], z: [Z0, Z1], cell } = VERDOR.land;
const nx = Math.round((X1 - X0) / cell) + 1, nz = Math.round((Z1 - Z0) / cell) + 1;
const h = new Float32Array(nx * nz), base = new Float32Array(nx * nz), Fm = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const x = X0 + i * cell, z = Z0 + j * cell, k = j * nx + i;
  h[k] = base[k] = W.baseLand(x, z);
  Fm[k] = W.coastF(x, z);
}
console.log(`[land] grid ${nx} x ${nz} (${cell} m), base built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
// erodible: the land, fading out 12 m before the cliff edge (drops that reach it fall off the
// cliff and die) and toward the grid border
const border = (i, j) => Math.min(smoothstep(0, 60, Math.min(i, nx - 1 - i)), smoothstep(0, 60, Math.min(j, nz - 1 - j)));
const mask = (i, j) => { const F = Fm[j * nx + i]; return F > -6 ? 0 : smoothstep(-6, -30, F) * border(i, j); };
const SP_IT = +arg('--sp', 40), SP_K = +arg('--K', 0.0016);
erodeStreamPower(h, nx, nz, { cell, iterations: SP_IT, K: SP_K, m: 0.5, D: 0.6,
  outlet: (i, j) => Fm[j * nx + i] > -6, erodible: mask,
  onProgress: (f) => process.stdout.write(`\r[land] stream power ${(f * 100).toFixed(0)}%   `) });
process.stdout.write('\n');
erodeHydraulic(h, nx, nz, { cell, drops: DROPS, seed: 7, radius: 3, capacity: 6, erode: 0.35, deposit: 0.2, evaporate: 0.012, inertia: 0.08, maxSteps: 90, mask,
  onProgress: (f) => process.stdout.write(`\r[land] hydraulic ${(f * 100).toFixed(0)}%   `) });
process.stdout.write('\n');
erodeThermal(h, nx, nz, { cell, talus: 0.75, iterations: 25, rate: 0.3, mask });
// fade the change out toward the grid border (joins the unbaked far land)
const wear = new Uint8Array(nx * nz), dep = new Uint8Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const k = j * nx + i, b = border(i, j);
  const d = (h[k] - base[k]) * b;
  h[k] = base[k] + d;
  wear[k] = Math.min(255, Math.max(0, -d) * 40);
  dep[k] = Math.min(255, Math.max(0, d) * 60);
}
{ let mn = 0, mx = 0, s = 0; for (let k = 0; k < nx * nz; k++) { const d = h[k] - base[k]; mn = Math.min(mn, d); mx = Math.max(mx, d); s += Math.abs(d); } console.log(`[land] change: min ${mn.toFixed(1)} m, max ${mx.toFixed(1)} m, mean |d| ${(s / (nx * nz)).toFixed(2)} m`); }
const acc = flowAccumulation(h, nx, nz);
const flow = new Uint8Array(nx * nz);
for (let k = 0; k < nx * nz; k++) flow[k] = Math.min(255, Math.log2(acc[k]) * 18);
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'land.dkhm');
fs.writeFileSync(file, encodeHeightmap({ x0: X0, z0: Z0, cell, nx, nz, seed: W.seed, drops: DROPS }, h, [
  { name: 'flow', data: flow, scale: 1 / 18 }, { name: 'wear', data: wear, scale: 1 / 40 }, { name: 'dep', data: dep, scale: 1 / 60 },
]));
console.log(`[land] wrote ${file} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

if (PREVIEW) {
  // hillshade + water courses, north up (z up), sea dark
  const buf = Buffer.alloc(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, r = (nz - 1 - j) * nx + i;
    const hx = (h[k + (i < nx - 1 ? 1 : 0)] - h[k - (i > 0 ? 1 : 0)]) / (2 * cell), hz = (h[k + (j < nz - 1 ? nx : 0)] - h[k - (j > 0 ? nx : 0)]) / (2 * cell);
    const n = [-hx * 3, 1, -hz * 3], l = Math.hypot(...n);
    let s = Math.max(0, (n[0] * -0.5 + n[1] * 0.7 + n[2] * 0.5) / l);
    let c = [70 + 150 * s, 80 + 140 * s, 60 + 120 * s];
    if (Fm[k] > 0) c = [20, 40, 70];
    if (flow[k] > 210) c = [40, 80, 160];
    buf[r * 3] = c[0]; buf[r * 3 + 1] = c[1]; buf[r * 3 + 2] = c[2];
  }
  fs.writeFileSync(PREVIEW, Buffer.concat([Buffer.from(`P6 ${nx} ${nz} 255\n`), buf]));
}
