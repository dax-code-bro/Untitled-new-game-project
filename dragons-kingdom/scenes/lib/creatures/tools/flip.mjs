// flip.mjs <name> <pose> [pose opts JSON] [skin opts JSON] - count/locate inverted (flipped) body triangles in a pose
// (node scenes/lib/creatures/tools/flip.mjs starlight upright; a draft build, no drapes)
import * as THREE from 'three';
import { createCreature, poses } from '../index.js';
const name = process.argv[2] || 'starlight', pn = process.argv[3] || 'upright';
const c = await createCreature(name, { quality: 'draft', drape: false, skin: JSON.parse(process.argv[5] || '{}') });
const extra = JSON.parse(process.argv[4] || '{}'); c.setPose(poses[pn](c, { t: 0, blink: false, ...extra }));
const body = c.meshes[0];
body.skeleton.update();
const g = body.geometry, n = g.attributes.position.count, idx = g.index.array;
const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
const v = new THREE.Vector3(), nn = new THREE.Vector3();
const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
const bm = body.skeleton.boneMatrices;
const m4 = new THREE.Matrix4(), acc = new THREE.Matrix4();
for (let i = 0; i < n; i++) {
  body.getVertexPosition(i, v); P.set([v.x, v.y, v.z], i * 3);
  // skinned normal
  acc.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
  const e = acc.elements; e.fill(0);
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (!w) continue; m4.fromArray(bm, si.getComponent(i, k) * 16); for (let q = 0; q < 16; q++) e[q] += w * m4.elements[q]; }
  nn.fromBufferAttribute(g.attributes.normal, i).transformDirection(acc);
  N.set([nn.x, nn.y, nn.z], i * 3);
}
let flips = 0; const pts = []; const hist = new Map();
const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
for (let t = 0; t < idx.length; t += 3) {
  const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
  a.fromArray(P, i0 * 3); b.fromArray(P, i1 * 3); cc.fromArray(P, i2 * 3);
  const fn = b.clone().sub(a).cross(cc.clone().sub(a));
  if (fn.lengthSq() < 1e-14) continue;
  const vn = new THREE.Vector3(N[i0*3]+N[i1*3]+N[i2*3], N[i0*3+1]+N[i1*3+1]+N[i2*3+1], N[i0*3+2]+N[i1*3+2]+N[i2*3+2]);
  if (fn.dot(vn) < 0) { flips++; pts.push(a.clone()); for (const ii of [i0, i1, i2]) for (let k = 0; k < 4; k++) { const w = sw.getComponent(ii, k); if (w > 0.15) { const bn = c.bones[si.getComponent(ii, k)].name; hist.set(bn, (hist.get(bn) || 0) + w); } } }
}
console.log(name, pn, 'triangles', idx.length / 3, 'flipped', flips);
// cluster by rest-ish location: print bounding stats of flips
const bins = new Map();
for (const p of pts) { const k = [Math.round(p.x / (c.L * 0.03)), Math.round(p.y / (c.L * 0.03)), Math.round(p.z / (c.L * 0.03))].join(','); bins.set(k, (bins.get(k) || 0) + 1); }
console.log([...bins.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, n2]) => `${k.split(',').map((q) => (q * c.L * 0.03).toFixed(1)).join('/')}:${n2}`).join('  '));

console.log([...hist.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, w]) => k + ':' + w.toFixed(0)).join('  '));
const inv = new THREE.Matrix4().copy(c.root.matrixWorld).invert();
for (const b of ['w_L_0', 'w_L_1', 'w_L_2', 'w_L_sh', 'neck_0', 'hl_L_0', 'hl_L_1']) { const p = new THREE.Vector3().setFromMatrixPosition(c.bones[c.boneIndex[b]].matrixWorld).applyMatrix4(inv); console.log(b, p.toArray().map((x) => x.toFixed(1)).join('/')); }
