// Creature look-development scene for quick iteration. Reads
// creatures-dev.json next to this file: { creature, quality, hdri, rotationY,
// exposure, ground, views: [{ cam:[x,y,z], target:[x,y,z], fov, pose, yaw }] }.
// View i is shown for t in [i, i+1).
//   node render/render.mjs --still scenes/lookdev/creatures-dev.js --time 0 --preset preview --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { createCreature, poses, loadHuman, createRider, createSaddle, mountRider } from '../lib/creatures/index.js';

export const meta = { title: 'Creature lookdev (dev)', duration: 8, toneMapping: 'aces', exposure: 0.65, vignette: 0.08, seed: 1 };

let C = null, cfg = null;
export async function setup(ctx) {
  cfg = await (await fetch(new URL('./creatures-dev.json', import.meta.url))).json();
  if (cfg.exposure) ctx.post.exposure = cfg.exposure;
  const sky = await loadHDRI(cfg.hdri || 'hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: cfg.rotationY ?? -1.58, backgroundBlurriness: 0 });
  const sun = sky.apply(ctx.scene);
  C = await createCreature(cfg.creature, { quality: cfg.quality || 'draft', log: (s) => console.log(s) });
  const L = C.L;
  sun.castShadow = true;
  sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.position.copy(sky.sun.direction).multiplyScalar(L * 3);
  sun.target.position.set(0, 0, 0);
  const e = L * 0.95;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: L * 0.5, far: L * 6 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = L * 0.0006;
  sun.shadow.camera.updateProjectionMatrix();
  ctx.scene.add(sun, sun.target);
  if (cfg.ground !== false) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(L * 8, 96), new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.16, 0.15, 0.13), roughness: 0.95 }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    ctx.scene.add(g);
  }
  ctx.scene.add(C.root);
  if (cfg.rider) {
    const human = await loadHuman();
    const tack = createSaddle(C, cfg.saddle || {});
    const rider = createRider(human, { outfit: cfg.rider });
    mountRider(C, tack, rider);
    if (cfg.humanBeside) {
      const h2 = createRider(human, { outfit: cfg.humanBeside, pose: 'stand' });
      h2.root.position.set(...cfg.humanAt.map((v) => v * C.L));
      ctx.scene.add(h2.root);
    }
  }
  ctx.camera.near = L * 0.002; ctx.camera.far = L * 60;
}

export function update(t, ctx) {
  const views = cfg.views;
  const v = views[Math.min(views.length - 1, Math.floor(t))];
  const tt = t - Math.floor(t);
  const pose = v.pose ? poses[v.pose.name](C, { ...v.pose, t: (v.pose.t ?? 0) + tt * (v.pose.dt ?? 0) }) : { ground: true };
  C.setPose(pose);
  C.root.rotation.y = (v.yaw ?? 0) * Math.PI / 180;
  const L = C.L;
  ctx.camera.position.set(v.cam[0] * L, v.cam[1] * L, v.cam[2] * L);
  ctx.camera.lookAt(v.target[0] * L, v.target[1] * L, v.target[2] * L);
  ctx.camera.fov = v.fov ?? 35;
  ctx.camera.updateProjectionMatrix();
}
