// Architecture - probe: measures Charcoal's seat height (lying, as in F2 / 1C, and standing) so the
// access rig's deck and gangway land at the saddle (no jumps). Logs it; renders Charcoal beside a
// 2 m pole grid for a visual check.
//   node render/render.mjs --still scenes/lookdev/architecture-probe.js --time 0 --preset draft --cinematic off --png probe.png
import * as THREE from 'three';
import { createCreature, poses, createSaddle } from '../lib/creatures/index.js';

export const meta = { title: 'Architecture - probe', duration: 1, seed: 1 };

export async function setup(ctx) {
  const { scene, camera } = ctx;
  scene.background = new THREE.Color(0.6, 0.65, 0.7);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  const charcoal = await createCreature('charcoal', { quality: 'draft' });
  scene.add(charcoal.root);
  const rig = createSaddle(charcoal, {});
  const out = {};
  for (const [name, pose] of [['lie', poses.lie(charcoal, { t: 0, raise: -0.62, headDown: 0.32 })], ['stand', poses.rest ? poses.rest(charcoal, {}) : null]]) {
    if (!pose) continue;
    charcoal.setPose(pose);
    charcoal.root.position.set(0, 0, 0);
    charcoal.root.updateMatrixWorld(true);
    const bi = charcoal.bones.indexOf(rig.seatBone);
    const seat = rig.seatPoint.clone().applyMatrix4(charcoal.skeleton.boneInverses[bi]).applyMatrix4(rig.seatBone.matrixWorld);
    const box = new THREE.Box3().setFromObject(charcoal.root);
    out[name] = { seat: seat.toArray().map((v) => +v.toFixed(2)), min: box.min.toArray().map((v) => +v.toFixed(2)), max: box.max.toArray().map((v) => +v.toFixed(2)) };
  }
  console.warn('[arch-probe] charcoal ' + JSON.stringify(out));
  charcoal.setPose(poses.lie(charcoal, { t: 0, raise: -0.62, headDown: 0.32 }));
  for (let y = 0; y <= 14; y += 2) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), new THREE.MeshBasicMaterial({ color: 0xff0000 })); m.position.set(0, y, 12); scene.add(m); }
  camera.position.set(45, 10, 25); camera.lookAt(0, 5, 0); camera.near = 0.1; camera.far = 500;
}
export function update() {}
