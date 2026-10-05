// Breaks the determinism rules on purpose: stateful randomness, Math.random and
// the wall clock inside update(). The runtime must notice and report it (test
// (b4)) - but NOT three.js' own Math.random calls for object UUIDs (a helper
// Object3D made in update() is harmless).
import * as THREE from 'three';
export const meta = { title: 'Misuse fixture', duration: 2 };
let box, setupRng;
export async function setup(ctx) {
  ctx.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshLambertMaterial({ color: 0x44aa66 }));
  ctx.scene.add(box);
  ctx.camera.position.set(0, 0, 20); ctx.camera.lookAt(0, 0, 0);
  setupRng = ctx.makeRng(5);                       // created in setup...
}
export function update(t, ctx) {
  const fine = ctx.makeRng(ctx.frame)();           // made inside update from the frame: allowed
  box.rotation.set(ctx.rng() * 0.1, setupRng() * 0.1 + fine * 0.01, t);   // ...used in update: reported
  box.position.x = (Date.now() % 7) * 0;           // wall clock: reported
  box.position.y = Math.random() * 0;              // Math.random: reported
  const helper = new THREE.Object3D();             // 4 Math.random calls inside three (UUID): not reported
  helper.position.set(0, 0, 0);
}
