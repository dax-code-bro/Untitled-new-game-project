// update() never returns at frame 5 (an endless loop - a scene bug). The job's
// stall watchdog must restart the worker and finally give up with a clear
// message instead of waiting forever (test (c3)).
import * as THREE from 'three';
export const meta = { title: 'Hang fixture', duration: 2 };
let box;
export async function setup(ctx) {
  ctx.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshLambertMaterial({ color: 0x4466aa }));
  ctx.scene.add(box);
  ctx.camera.position.set(0, 0, 20); ctx.camera.lookAt(0, 0, 0);
}
export function update(t, ctx) {
  if (ctx.frame === 5) for (;;) { /* stuck */ }
  box.rotation.y = t;
}
