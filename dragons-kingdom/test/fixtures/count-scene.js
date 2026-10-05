// Culling-determinism fixture for InstancedMesh.count (test (b3)).
// A swarm whose instance matrices are fixed in setup; only the number of live
// instances changes with t: 5 scouts first (far off-screen, left), then the
// whole swarm of 40 in the middle of the picture from t = 1 s. three.js'
// InstancedMesh sphere covers only the first .count instances, so a sphere
// computed while count was 5 must not survive count growing to 40.
import * as THREE from 'three';
export const meta = { title: 'instance count fixture', duration: 4 };
let swarm;
export async function setup(ctx) {
  const { scene, camera } = ctx;
  scene.background = new THREE.Color(0x87a0c0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  swarm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshLambertMaterial({ color: 0x202020 }), 40);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    if (i < 5) m.makeTranslation(-120 - i * 3, 0, 0);
    else m.makeTranslation(((i - 5) % 7) * 3 - 9, Math.floor((i - 5) / 7) * 3 - 6, 0);
    swarm.setMatrixAt(i, m);
  }
  swarm.instanceMatrix.needsUpdate = true;
  scene.add(swarm);
  camera.position.set(0, 0, 40); camera.lookAt(0, 0, 0);
}
export function update(t) {
  swarm.count = t < 1 ? 5 : 40;
}
