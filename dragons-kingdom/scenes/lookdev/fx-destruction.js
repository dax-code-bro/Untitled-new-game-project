// FX lookdev - destruction (F6 in assets-delta.md, 3C-11 / 3C-27 / R15 / R16): a roofline edge
// struck from above and coming down (tiles, shards, rafters, lime plaster and daub, splinters),
// the music stage's boards scything across the paving, a burst of rubble, and the dust of it all.
// A stone house front for scale, a 1.8 m post and a grey ball (albedo 0.4).
//
// Views (8 s each, the effect restarts in every view):
//   0 wide from the steps     1 low across the paving (boards)     2 close on the pile at rest
//
//   node render/render.mjs --still scenes/lookdev/fx-destruction.js --time 1.2 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - destruction',
  duration: 24,
  seed: 4,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.2 },
    ao: { enabled: true, radius: 0.8 },
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), await groundMaterial('pbr/ph_sandstone_blocks_04', ctx, [80, 80], { tint: [0.9, 0.88, 0.84] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const wallMat = await loadPBR('pbr/ph_white_sandstone_bricks_03', ctx, { worldSize: [10, 5] });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.6), wallMat);
  wall.position.set(0, 2.5, -4.3); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
  const grey = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.4), roughness: 0.8 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 24), grey);
  ball.position.set(3.5, 0.4, 3); ball.castShadow = ball.receiveShadow = true; scene.add(ball);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 16), grey);
  post.position.set(-3.5, 0.9, 2.5); post.castShadow = post.receiveShadow = true; scene.add(post);

  const fx = await createFx(ctx, { ground: 0, wind: [0.6, 0, 0.2], tier: ctx.meta.fxTier });
  await fx.debris.library();
  // the roofline edge (eaves at ~4.6 m along the wall's top), struck from above-left
  await fx.debris.collapse({ box: [[-4, 4.4, -4.2], [1, 5.2, -3.4]], t0: 0.3, dir: [0.25, -0.2, 1], speed: 5, from: 0, runSpeed: 9, seed: 3,
    pieces: { tile: 40, tileShard: 70, beam: 3, board: 2, plaster: 35, splinter: 30 } });
  // the stage boards scything across the paving
  await fx.debris.boards({ at: [-5, 0.8, 1.0], dir: [1, 0.12, 0.25], t0: 1.0, count: 6, speed: 11, seed: 5 });
  // rubble thrown out of the wall foot
  await fx.debris.burst({ at: [2.5, 0.6, -3.9], dir: [0.1, 0.5, 1], spread: 0.7, speed: 6, t0: 0.6, pieces: { stone: 30, plaster: 15 }, seed: 7 });
  fx.dust.cloud({ at: [-1.5, 3.8, -3.6], t0: 0.45, radius: 4, dir: [0.2, -0.4, 1], speed: 5, color: 'chalk', life: 14, puffs: 200 });
  S = { fx };
}

const VIEWS = [
  { pos: [4.5, 1.7, 9.5], look: [-0.8, 2.0, -2.5], f: 24 },
  { pos: [5.5, 0.35, 4.5], look: [0, 0.3, 1.0], f: 32 },
  { pos: [0.5, 1.3, 1.2], look: [-1.5, 0.1, -2.5], f: 35 },
];
export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(VIEWS.length - 1, Math.floor(t / 8)), tt = t - view * 8;
  const V = VIEWS[view];
  cam.position.set(...V.pos); cam.lookAt(...V.look);
  cam.near = 0.05; cam.far = 2000;
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = V.f; ctx.lens.fstop = 5.6; ctx.lens.shutterAngle = 180;
  S.fx.update(tt);
  ctx.shadows.dynamic = S.fx.dynamic;
}
