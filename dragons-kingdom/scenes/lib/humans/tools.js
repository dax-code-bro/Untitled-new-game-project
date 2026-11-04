// Long-handled farm tools - simple procedural STAND-INS for the 'lean' posture / 'tool' gesture
// (motion.js): the props library has no hoe / spade / rake yet (REQUEST props in PROGRESS.md perf s11).
// Local frame: origin = where the tool meets the ground, +y up the shaft (the handle's top end at
// y = length), +z = the side the hoe blade / rake head reaches toward (the leaner's front).
//   import { toolProp } from './tools.js';
//   const hoe = toolProp('hoe', { length: 1.25 });       // kinds: hoe | spade | rake | staff
import * as THREE from 'three';

let MATS = null;
const mats = () => MATS || (MATS = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6e5238, roughness: 0.78 }),       // worn ash, hand-polished
  iron: new THREE.MeshStandardMaterial({ color: 0x4b4945, roughness: 0.62, metalness: 0.55 }),
});

/** A stand-in tool: kind 'hoe' (default) | 'spade' | 'rake' | 'staff'; o.length (m, ground to the top end). */
export function toolProp(kind = 'hoe', o = {}) {
  const M = mats();
  const L = o.length ?? 1.3, r = o.radius ?? 0.017;
  const g = new THREE.Group();
  g.name = `tool:${kind}`;
  g.userData.kind = 'tool';
  g.userData.length = L;
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  // the shaft, a little thicker toward the working end; the top end rounded off
  const y0 = kind === 'spade' ? 0.28 : 0.05;
  add(new THREE.CylinderGeometry(r * 0.92, r * 1.08, L - y0, 10, 1), M.wood, 0, y0 + (L - y0) / 2, 0);
  add(new THREE.SphereGeometry(r * 0.95, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.wood, 0, L, 0);
  if (kind === 'hoe') {
    // the iron neck turns forward at the foot of the shaft; the blade lies nearly flat, its edge on the ground
    add(new THREE.BoxGeometry(0.018, 0.012, 0.11), M.iron, 0, 0.05, 0.05, -0.35);
    add(new THREE.BoxGeometry(0.17, 0.004, 0.13), M.iron, 0, 0.012, 0.15, 0.12);
  } else if (kind === 'spade') {
    // blade pushed ~6 cm into the soil, straight down under the shaft
    add(new THREE.BoxGeometry(0.19, 0.3, 0.006), M.iron, 0, 0.09, 0);
    add(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.08, 10), M.iron, 0, 0.26, 0);
  } else if (kind === 'rake') {
    add(new THREE.BoxGeometry(0.36, 0.03, 0.03), M.wood, 0, 0.06, 0.02);
    for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.004, 0.003, 0.07, 5), M.wood, -0.16 + i * 0.04, 0.03, 0.04, 0.4);
  }
  return g;
}
