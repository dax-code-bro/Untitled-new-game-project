// FX lookdev - cloth, sparks and ash (F9, 3C, R18-03, R21): two festival banners on poles; at
// t = 1 a dragon's wake hits the square - one banner tears free of its pole and is thrown across
// the paving, the other rips along its middle and flogs; a banner settled over a man-sized shape
// (a capsule collider standing in for the body, R18-03); sparks off a spear skidding on stone;
// ash drifting down.
//
// Views (8 s each): 0 wide on the poles   1 the banner landing   2 the covered shape + ash
//
//   node render/render.mjs --still scenes/lookdev/fx-cloth.js --time 1.6 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - cloth, sparks, ash',
  duration: 24,
  seed: 12,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    ao: { enabled: true, radius: 0.6 },
    dof: { enabled: false },
    grade: { exposure: 0.0, whiteBalance: 5800 },
  },
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) - 2.0;
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(80);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), await groundMaterial('pbr/ph_sandstone_blocks_04', ctx, [80, 80], { tint: [0.88, 0.86, 0.82] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.85 });
  for (const x of [-2, 2]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 12), wood);
    pole.position.set(x, 2.5, 0); pole.castShadow = true; scene.add(pole);
  }
  const fx = await createFx(ctx, { ground: 0, wind: [1.2, 0, 0.4], tier: ctx.meta.fxTier });
  const gust = { t: 1.0, at: [-12, 3, -6], dir: [1, 0.1, 0.5], strength: 16, radius: 30, dur: 1.4, lift: 0.05 };
  // banner 1: torn free of its pole (pins released at 1.15 s)
  fx.cloth.banner({ hoist: [[-1.94, 4.8, 0.0], [-0.94, 4.8, 0.0]], size: [1.0, 2.6], hangDir: [0, -1, 0], t0: 1.15, gust, wind: [1.2, 0, 0.4], until: 9, seed: 1, fabric: 'wool', color: [0.3, 0.045, 0.03], border: { at: 0.05, width: 0.06, color: [0.5, 0.36, 0.08] } });
  // banner 2: stays on its pole, rips along its middle
  fx.cloth.banner({ hoist: [[2.06, 4.8, 0.0], [3.06, 4.8, 0.0]], size: [1.0, 2.6], t0: 1e9, gust, wind: [1.2, 0, 0.4], until: 9, seed: 2, tear: { t: 1.25, from: [0.5, 0.05], to: [0.45, 1.0], dur: 0.5 }, fabric: 'wool', color: [0.05, 0.085, 0.16], border: { at: 0.05, width: 0.05, color: [0.55, 0.5, 0.4] } });
  // R18-03: a banner lying over a man-sized shape
  fx.cloth.drape({ body: { at: [6, 0, 6], yaw: 0.3 }, size: [1.0, 2.6], t0: 16, settle: 3, seed: 3, fabric: 'wool', color: [0.26, 0.05, 0.035], border: { at: 0.05, width: 0.06, color: [0.45, 0.33, 0.08] }, dirt: 0.35 });
  // sparks: the spear skidding on the paving
  fx.sparks.burst({ at: [1, 0.02, 3], dir: [1, 0.25, 0.2], t0: 9.6, count: 90, speed: 6, spread: 0.6, seed: 4 });
  fx.sparks.burst({ at: [1.6, 0.02, 3.1], dir: [1, 0.3, 0.1], t0: 9.85, count: 50, speed: 5, spread: 0.6, seed: 5 });
  fx.ash.fall({ box: [[2, 0.5, 2], [10, 5, 10]], t0: 10, t1: 40, rate: 120, seed: 6 });
  S = { fx };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(2, Math.floor(t / 8));
  cam.near = 0.05; cam.far = 2000;
  ctx.lens.sensor = 'super35'; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  if (view === 0) { cam.position.set(1, 2.4, 10); cam.lookAt(0.5, 2.8, 0); ctx.lens.focalLength = 24; }
  else if (view === 1) { cam.position.set(4, 1.5, 9); cam.lookAt(1.5, 0.3, 3); ctx.lens.focalLength = 30; }
  else { cam.position.set(9, 1.6, 10.5); cam.lookAt(6, 0.3, 6); ctx.lens.focalLength = 35; }
  S.fx.update(t);
  ctx.shadows.dynamic = S.fx.dynamic;
}
