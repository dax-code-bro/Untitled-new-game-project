// Culling-determinism fixture. Both objects follow the contract (pure
// functions of t) and keep three's default frustumCulled = true:
//  * a flock (one InstancedMesh, instance matrices set in update) and
//  * a banner (one mesh whose vertices are rewritten in update)
// fly in from off-screen. three.js computes their culling bounding spheres
// lazily, once; without the runtime's guard a browser that rendered frame 0
// first keeps the off-screen sphere and culls them at frame 48 (test (b3)).
import * as THREE from 'three';
export const meta = { title: 'Cull fixture', duration: 4 };
let flock, geo, base;
const m = new THREE.Matrix4();
export async function setup(ctx) {
  const { scene, camera } = ctx;
  scene.background = new THREE.Color(0x87a0c0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  flock = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x202020 }), 20);
  scene.add(flock);
  geo = new THREE.PlaneGeometry(6, 4, 12, 8);
  base = Float32Array.from(geo.attributes.position.array);
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xaa2222, side: THREE.DoubleSide })));
  camera.position.set(0, 0, 30); camera.lookAt(0, 0, 0);
}
export function update(t) {
  for (let i = 0; i < 20; i++) {
    m.makeTranslation(-80 + 40 * t + (i % 5) * 2.5, Math.floor(i / 5) * 2 + 2 + Math.sin(t * 6 + i) * 0.3, 0);
    flock.setMatrixAt(i, m);
  }
  flock.instanceMatrix.needsUpdate = true;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, base[i * 3] + 60 - 30 * t, base[i * 3 + 1] - 6 + Math.sin(t * 3 + base[i * 3]) * 0.3, 0);
  p.needsUpdate = true;
}
