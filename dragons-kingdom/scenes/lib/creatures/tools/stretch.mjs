// stretch.mjs <name> <pose,pose,...> [quality] [skin opts JSON] - posed/rest edge lengths of the body skin
// (finds "curtains": rows of triangles stretched across a weight seam - edges longer than 6x / 15x
// the median rest edge and stretched more than 3x). node scenes/lib/creatures/tools/stretch.mjs starlight glide,sit
import * as THREE from 'three';
import { createCreature, poses } from '../index.js';
const name = process.argv[2] || 'starlight';
const pnames = (process.argv[3] || 'glide,upright').split(',');
const quality = process.argv[4] || 'draft';
const t0 = Date.now();
const skin = JSON.parse(process.argv[5] || '{}');
const c = await createCreature(name, { quality, drape: false, skin });
console.log(name, quality, 'built', Date.now() - t0, 'ms');
const body = c.meshes[0];
const g = body.geometry, n = g.attributes.position.count, idx = g.index.array;
const R = g.attributes.position.array;
const si = g.attributes.skinIndex;
// unique edges
const edges = new Map();
for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
  const a = idx[t + k], b = idx[t + (k + 1) % 3];
  const key = a < b ? a * n + b : b * n + a;
  edges.set(key, a < b ? [a, b] : [b, a]);
}
const E = [...edges.values()];
const rl = E.map(([a, b]) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2])).sort((x, y) => x - y);
const med = rl[rl.length >> 1];
console.log('median rest edge', med.toFixed(3));
for (const pn of pnames) {
  c.setPose(poses[pn](c, { t: 0, blink: false }));
  c.root.updateMatrixWorld(true);
  body.skeleton.update();
  const P = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { body.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
  let n3 = 0, n5 = 0, mx = 0; const bins = new Map(); const hb = new Map();
  for (const [a, b] of E) {
    const r0 = Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
    const r1 = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    if (r0 < 1e-6) continue;
    const q = r1 / r0;
    if (q > mx) mx = q;
    if (q > 3 && r1 > med * 6) {
      n3++;
      if (r1 > med * 15) n5++;
      const s = c.L * 0.05;
      const key = [Math.round(R[a * 3] / s), Math.round(R[a * 3 + 1] / s), Math.round(R[a * 3 + 2] / s)].join(',');
      bins.set(key, (bins.get(key) || 0) + 1);
      for (const ii of [a, b]) { const bn = c.bones[si.getComponent(ii, 0)].name; hb.set(bn, (hb.get(bn) || 0) + 1); }
    }
  }
  console.log(`${pn}: edges ${E.length} >6med ${n3} >15med ${n5} max ${mx.toFixed(1)}x | rest-pos clusters ${[...bins.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, m]) => `${k.split(',').map((q) => (q * c.L * 0.05).toFixed(1)).join('/')}:${m}`).join(' ')} | bones ${[...hb.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, m]) => k + ':' + m).join(' ')}`);
}
