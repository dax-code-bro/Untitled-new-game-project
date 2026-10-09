// Props - hero angle: a fully dressed festival market stall at eye level (PROVISIONAL design).
// A greengrocer's stall in Cling: oak frame lashed at the joints, a striped canvas awning
// stretched over it (cloth-simulated: sagging between its ties, the valance hanging over the
// front rail), goods on the counter in woven baskets, onion strings and herb bunches hanging
// from the rail, sacks, a barrel, a crate of turnips, baskets on the ground; a baker's stall
// beside it. Morning sun from camera left, partly cloudy sky (CC0 HDRI). 35 mm, T4, eye level.
//
//   node render/render.mjs --still scenes/lookdev/props-stall.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { festivalKit } from '../lib/props/festival.js';
import { yawFrame } from '../lib/props/core.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Props - festival stall at eye level (PROVISIONAL)',
  duration: 4,
  seed: 3,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 0.8 },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.5 },
    dof: { samples: 48 },
    grade: { exposure: 0.35, whiteBalance: 5600 },
  }),
};

const KIND = 'veg';
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 3.4 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix();
  sun.target.position.set(0, 1, 0); sun.position.copy(sky.sun.direction).multiplyScalar(80);
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), await groundMaterial('pbr/acg_ground27', ctx, [80, 80], { tint: [0.8, 0.78, 0.74] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const fk = await festivalKit(ctx);
  scene.add(await fk.stall(yawFrame([0, 0, 0], 0), KIND, { seed: 11, size: '3', awning: [[0.075, 0.12, 0.05], [0.4, 0.36, 0.28]] }));
  scene.add(await fk.stall(yawFrame([-3.9, 0, -0.6], 0.25), 'bread', { seed: 5, size: '24' }));
  scene.add(await fk.stall(yawFrame([3.9, 0, -0.9], -0.3), 'pottery', { seed: 8, size: '24' }));
  S = { sun };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  cam.position.set(1.1, 1.62, 5.6);
  cam.lookAt(-0.15, 1.35, 0);
  cam.near = 0.05; cam.far = 500;
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = 32;
  ctx.lens.fstop = 4;
  ctx.lens.focus = 5.3;
  ctx.lens.shutterAngle = 180;
}
