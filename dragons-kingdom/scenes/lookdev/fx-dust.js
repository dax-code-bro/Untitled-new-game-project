// FX lookdev - downwash dust: a 36 m dragon's take-off over the dry riding-grounds field (1C-05 /
// 1C-06: "dirt lifts, turf breaks, loose stones jump, a rolling dust cloud crosses the empty
// launch area"). No dragon here - the ground effect alone, with a 1.8 m post and a grey ball
// (albedo 0.4) for scale and light reference. Four downstrokes at t = 0.5, 1.35, 2.2, 3.05 s.
//
//   node render/render.mjs --still scenes/lookdev/fx-dust.js --time 2.5 --preset draft --png out.png
//   node render/render.mjs scenes/lookdev/fx-dust.js --preset draft --seconds 8
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - downwash dust (take-off)',
  duration: 24,
  seed: 5,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2 },
    ao: { enabled: true, radius: 1.0 },
    dof: { enabled: false },
    grade: { exposure: 0.0, whiteBalance: 5800 },
  },
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) - 0.6;   // sun from front-left, low-ish
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(150);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), await groundMaterial('pbr/acg_ground037', ctx, [600, 600], { tint: [0.85, 0.82, 0.75] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // scale references
  const grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.4), roughness: 0.8 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 24), grey);
  ball.position.set(-9, 0.6, 30); ball.castShadow = ball.receiveShadow = true; scene.add(ball);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 24), grey);
  post.position.set(-6, 0.9, 32); post.castShadow = post.receiveShadow = true; scene.add(post);
  const fx = await createFx(ctx, { ground: 0, wind: [1.2, 0, 0.4], tier: ctx.meta.fxTier });
  fx.dust.downwash({ at: [0, 0, 0], t0: 0.5, bursts: [0, 0.85, 1.7, 2.55], radius: 30, strength: 1, color: 'loam' });
  S = { fx };
}

// views: t in [0,12) wide from 100 m; [12,24) low and close to the front (the same effect time)
export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.floor(t / 12), tt = t - view * 12;
  if (view === 0) { cam.position.set(6, 1.8, 105); cam.lookAt(0, 6, 0); ctx.lens.focalLength = 35; ctx.lens.focus = 100; }
  else { cam.position.set(-14, 1.2, 46); cam.lookAt(2, 3.2, 20); ctx.lens.focalLength = 28; ctx.lens.focus = 26; }
  cam.near = 0.1; cam.far = 3000;
  ctx.lens.sensor = 'super35'; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  S.fx.update(tt);
}
