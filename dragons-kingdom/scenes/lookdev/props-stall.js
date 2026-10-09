// Props - hero angle: a fully dressed festival market stall at eye level (PROVISIONAL design).
// A greengrocer's stall in Cling: oak frame lashed at the joints, a striped canvas awning
// stretched over it (cloth-simulated: sagging between its ties, the valance hanging over the
// front rail), goods on the counter in woven baskets, onion strings and herb bunches hanging
// from the rail, sacks, a barrel, a crate of turnips, baskets on the ground; a baker's stall
// beside it. Morning sun from front left, partly cloudy sky (CC0 HDRI). 29 mm, T4, eye level, 4 m.
//
//   node render/render.mjs --still scenes/lookdev/props-stall.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { festivalKit } from '../lib/props/festival.js';
import { yawFrame } from '../lib/props/core.js';
import { Kit as ArchKit, yawFrame as archYaw } from '../lib/architecture/core.js';
import { archMaterials } from '../lib/architecture/materials.js';
import { house } from '../lib/architecture/house.js';
import { paving } from '../lib/architecture/cling.js';
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
  // the sun turned to stand front-left of the stall (over the camera's left shoulder), so the
  // houses behind do not shade it
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const az0 = Math.atan2(sky.sun.direction.z, sky.sun.direction.x), rot = az0 - 2.2;
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix();
  sun.target.position.set(0, 1, 0); sun.position.copy(sky.sun.direction).multiplyScalar(80);
  scene.add(sun, sun.target);
  // the square: cobbles, a row of houses behind the stalls (architecture library), bunting
  const AM = await archMaterials(ctx);
  const ak = new ArchKit(0);
  paving(ak, -9, 9, -4.2, 9, { seed: 12 });
  let hx = -10.5;
  [6.6, 6.0, 7.2].forEach((w, i) => { house(ak, archYaw([hx + w / 2, 0, -4.4 - 4.5], 0), { w, d: 9, storeys: 1 + (i % 2), roof: i === 1 ? 'side' : 'front', seed: 31 + i * 9, cover: i % 2 ? 'slate' : 'clay', lod: 'mid', party: { left: i > 0, right: i < 2 } }); hx += w; });
  scene.add(ak.build(AM, { name: 'square' }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), await groundMaterial('pbr/acg_ground03', ctx, [200, 200], { tint: [0.6, 0.58, 0.55] }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  const fk = await festivalKit(ctx);
  scene.add(await fk.stall(yawFrame([0, 0, 0], 0), KIND, { seed: 11, size: '3', awning: [[0.075, 0.12, 0.05], [0.4, 0.36, 0.28]] }));
  scene.add(await fk.stall(yawFrame([-3.9, 0, -0.6], 0.25), 'bread', { seed: 5, size: '24' }));
  scene.add(await fk.stall(yawFrame([3.9, 0, -0.9], -0.3), 'pottery', { seed: 8, size: '24' }));
  scene.add(await fk.bunting(new THREE.Vector3(-6.5, 4.6, -4.3), new THREE.Vector3(6.0, 4.3, -4.1), { seed: 9, slack: 0.025 }));
  S = { sun };
}

export function update(t, ctx) {
  const cam = ctx.camera;
  // t < 2: the hero; t >= 2: a close look at the goods on the counter (render well after the cut)
  const detail = t >= 2;
  if (detail) { cam.position.set(t >= 4 ? 1.3 : 0.95, t >= 4 ? 1.3 : 1.45, t >= 4 ? 1.05 : 1.55); cam.lookAt(t >= 4 ? 1.1 : 0.62, 0.95, 0.3); }
  else { cam.position.set(1.2, 1.65, 4.25); cam.lookAt(-0.1, 1.55, 0); }
  cam.near = 0.05; cam.far = 500;
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = detail ? 32 : 29;
  ctx.lens.fstop = detail ? 8 : 4;
  ctx.lens.focus = detail ? (t >= 4 ? 0.85 : 1.35) : 4.0;
  ctx.lens.shutterAngle = 180;
}
