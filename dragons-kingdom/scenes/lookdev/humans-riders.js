// Humans - riders in the dragons' saddles, at scale (PROVISIONAL). Uses the creature library's
// saddle / riding rig and mountRider() unchanged, with the human library's createRider()
// adapter in place of the placeholder mannequin.
//   t 0-1  Abby on Leaf (saddle), 3/4 front, whole dragon + rider
//   t 1-2  Abby on Leaf, closer: seat, legs, hands at the reins
//   t 2-3  Remi on Charcoal's riding rig, from the shoulder
//   node render/render.mjs --still scenes/lookdev/humans-riders.js --time 0.5 --preset preview --png riders.png
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, poses, createSaddle, mountRider } from '../lib/creatures/index.js';
import { loadHuman, createRider } from '../lib/humans/index.js';
import { filmFinish } from './finish.js';
import { reviewTime } from '../lib/humans/stage.js';

export const meta = {
  title: 'Humans - riders at scale (PROVISIONAL)',
  duration: 3,
  seed: 7,
  cinematic: filmFinish({ shadows: { cascades: 2 }, ao: { enabled: true, radius: 0.4 }, dof: { samples: 48 }, grade: { exposure: 0.1, whiteBalance: 6000 } }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: -1.2, backgroundBlurriness: 0.1 });
  const sun = sky.apply(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0002;
  scene.add(sun, sun.target);
  const g = new THREE.Mesh(new THREE.CircleGeometry(400, 96), await loadPBR('pbr/acg_ground13', ctx, { worldSize: 800 }));   // UV 0..1 = diameter
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const human = await loadHuman({ ids: ['abby_ride', 'remi_ride'] });
  const sunDir = sky.sun.direction.clone().normalize();
  const sunAz = Math.atan2(sunDir.x, sunDir.z);
  const leaf = await createCreature('leaf', { quality: 'standard' });
  leaf.root.position.set(0, 0, 0);
  leaf.root.rotation.y = sunAz + 1.1;
  scene.add(leaf.root);
  const abby = createRider(human, { outfit: 'abby' });
  mountRider(leaf, createSaddle(leaf, {}), abby);
  const charcoal = await createCreature('charcoal', { quality: 'draft' });
  charcoal.root.position.set(120, 0, 0);
  charcoal.root.rotation.y = sunAz + 1.2;
  scene.add(charcoal.root);
  const remi = createRider(human, { outfit: 'remi' });
  mountRider(charcoal, createSaddle(charcoal, {}), remi);
  S = { sun, sunDir, sunAz, leaf, charcoal, abby, remi };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const { leaf, charcoal, abby, remi, sun, sunDir, sunAz } = S;
  leaf.setPose(poses.stand(leaf, { blink: false, t: 0 }));
  charcoal.setPose(poses.stand(charcoal, { blink: false, t: 0 }));
  const rt = reviewTime(t, ctx);
  t = rt.lt;
  abby.update(t); remi.update(t);
  leaf.root.updateMatrixWorld(true); charcoal.root.updateMatrixWorld(true);
  const k = Math.min(2, Math.max(0, rt.k));
  const rider = k < 2 ? abby : remi;
  const head = new THREE.Vector3();
  rider.character.bone('spine03').getWorldPosition(head);
  const camAz = sunAz - 0.7;
  const dir = new THREE.Vector3(Math.sin(camAz), 0, Math.cos(camAz));
  let tgt, dist, fov, fstop;
  if (k === 0) { tgt = new THREE.Vector3(0, 2.0, 0).lerp(head, 0.4); dist = 14; fov = 34; fstop = 8; }
  else if (k === 1) { tgt = head.clone().add(new THREE.Vector3(0, -0.25, 0)); dist = 3.4; fov = 30; fstop = 4; }
  else { tgt = head.clone().add(new THREE.Vector3(0, -0.1, 0)); dist = 4.5; fov = 30; fstop = 5.6; }
  camera.position.copy(tgt).addScaledVector(dir, dist).add(new THREE.Vector3(0, dist * 0.12, 0));
  camera.lookAt(tgt);
  camera.fov = fov; camera.near = 0.05; camera.far = 2000;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = fstop; ctx.lens.focus = camera.position.distanceTo(tgt); ctx.lens.shutterAngle = 45; }
  const c = k < 2 ? leaf.root.position : charcoal.root.position;
  const r = k < 2 ? 8 : 6;
  const g = tgt.clone();
  sun.target.position.copy(g); sun.position.copy(g).addScaledVector(sunDir, 80);
  const sc = sun.shadow.camera;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 40; sc.far = 140;
  sc.updateProjectionMatrix();
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  void c;
}
