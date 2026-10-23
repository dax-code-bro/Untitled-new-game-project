// FX lookdev - fire (F2 / 1F-13..1F-15 in assets-delta.md and the shot list): a dragon-sized jet
// (Charcoal's orange-red; Leaf's purplish-blue for comparison) from 7 m up raking the dry ground -
// flame body, soot, embers, heat haze, light on the ground and on a grey ball, the scorch it
// leaves; then a burning bundle on a stake (cloth / straw), and a burning stand-in for the scout's
// rider racing past at 30 m/s with the flames torn back and smoke streaming in the slipstream.
//
// Views (6 s each): 0 wide on the jet   1 close on the jet's impact   2 Leaf's palette
//                   3 the burning stake   4 the moving burner (tracking camera)   5 scorch after
//
//   node render/render.mjs --still scenes/lookdev/fx-fire.js --time 1.0 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - fire',
  duration: 36,
  seed: 6,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2 },
    ao: { enabled: true, radius: 1.0 },
    dof: { enabled: false },
    grade: { exposure: 0.0, whiteBalance: 5600 },
  },
};

let S;
const V = 6;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) + 2.4;    // sun behind-left of the camera
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(150);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), await groundMaterial('pbr/acg_ground037', ctx, [600, 600], { tint: [0.85, 0.8, 0.7] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.4), roughness: 0.8 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 24), grey);
  ball.position.set(-5, 0.8, 14); ball.castShadow = ball.receiveShadow = true; scene.add(ball);
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }));
  stake.position.set(40, 0.9, 0); stake.castShadow = true; scene.add(stake);
  const runner = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 6, 12), grey);
  runner.castShadow = true; scene.add(runner);

  const fx = await createFx(ctx, { ground: 0, wind: [1.5, 0, 0.5], tier: ctx.meta.fxTier });
  // jet: mouth 7 m up at x=-12, raking from z=4 to z=14 over 1.6 s
  const mouth = [-12, 7, 0];
  const dirAt = (t) => { const u = THREE.MathUtils.clamp((t - 0.3) / 1.6, 0, 1); return [1, -0.42 - 0.08 * u, 0.1 + 0.35 * u]; };
  fx.fire.jet({ origin: mouth, dir: dirAt, t0: 0.3, t1: 1.9, length: 24, palette: 'standard', scorch: { target: ground }, seed: 2 });
  // Leaf's jet in view 2 (its own effect, its own time)
  const leafFx = { t0: 0.3 };
  fx.fire.jet({ origin: [-12, 3, 30], dir: [1, -0.12, 0.12], t0: 12.3, t1: 13.9, length: 13, palette: 'leaf', seed: 4 });
  // burning stake (cloth / straw bundle)
  fx.fire.burn({ at: [40, 1.5, 0], t0: 0, t1: 40, size: 0.3, seed: 5, smokeRate: 30 });
  fx.fire.embers({ at: [40, 1.4, 0], t0: 0, t1: 40, rate: 12, radius: 0.25, seed: 6 });
  // the moving burner: 30 m/s along +x at 3 m, passing x = 70..130
  const runAt = (t) => [70 + (t - 24) * 30, 3, 20];
  const burnAt = (t) => { const p = runAt(t); return [p[0] - 0.35, p[1] + 0.25, p[2] + 0.2]; };   // on the back of the capsule's shoulder
  fx.fire.burn({ at: burnAt, t0: 24.0, t1: 30, size: 0.35, seed: 7, smokeRate: 70, smokeLife: 3 });
  S = { fx, runner, runAt };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(5, Math.floor(t / V));
  const tt = view === 2 || view === 4 ? t : t - view * V;     // views 2 and 4 use the absolute timeline
  cam.near = 0.1; cam.far = 3000;
  ctx.lens.sensor = 'super35'; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  if (view === 0) { cam.position.set(2, 2.2, 34); cam.lookAt(-2, 2.5, 6); ctx.lens.focalLength = 28; }
  else if (view === 1) { cam.position.set(8, 1.6, 22); cam.lookAt(-1, 1.0, 9); ctx.lens.focalLength = 35; }
  else if (view === 2) { cam.position.set(8, 2, 44); cam.lookAt(-4, 1.5, 32); ctx.lens.focalLength = 35; }
  else if (view === 3) { cam.position.set(43, 1.5, 4.5); cam.lookAt(40, 1.8, 0); ctx.lens.focalLength = 35; }
  else if (view === 4) { const p = S.runAt(t); cam.position.set(p[0] + 4, 4.5, 28); cam.lookAt(p[0] - 1, 3, 20); ctx.lens.focalLength = 35; }
  else { cam.position.set(6, 3.5, 22); cam.lookAt(-1, 0, 8); ctx.lens.focalLength = 30; }
  const rp = S.runAt(Math.max(24, t));
  S.runner.position.set(rp[0], rp[1], rp[2]); S.runner.rotation.z = Math.PI / 2;
  S.fx.update(view === 5 ? 6 : tt);
  ctx.shadows.dynamic = S.fx.dynamic;
}
