// Humans performance - the 'lean' posture (a farmer leaning on a hoe, X4-06): crowd05 (the shot's farmer)
// stands on her right leg, both hands stacked on the top of a stand-in hoe (tools.js), leaning onto it.
// Frame k = view k (front, three-quarter, side, back three-quarter, hands close-up); the pose at t = 4 s.
//   node render/render.mjs --still scenes/lookdev/humans-anim-tool.js --time 0.5 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { createPerformer, loadPerformanceData } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

const ID = 'crowd05', T_POSE = 4.0;
const VIEWS = [
  { az: 20, dist: 3.0, h: 1.1, fov: 30, aim: 0.95 },
  { az: 55 }, { az: 95 }, { az: 200 },
  { az: 35, dist: 1.0, h: 1.35, fov: 30, aim: 1.12 },
];

export const meta = {
  title: 'Humans performance - lean on a tool',
  duration: VIEWS.length,
  seed: 6,
  cinematic: filmFinish({ motionBlur: { mode: 'off' }, shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { samples: 24 }, grade: { exposure: 0.1, whiteBalance: 6000 } }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 0.9 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 100 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), await groundMaterial('pbr/acg_ground03', ctx, [120, 120]));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const data = await loadPerformanceData();
  const ch = await loadCharacter(ID);
  // (the build's market basket is not part of this shot)
  ch.root.traverse((m) => { if (m.isMesh && /basket/.test(m.name)) m.visible = false; });
  scene.add(ch.root);
  const P = createPerformer(ch, data, { arms: 'auto' }).place(0, 0, 0);
  P.posture('lean', -5, { in: 0.1, hold: 99, stance: 'R', tool: { prop: 'hoe' } });
  S = { ch, P, sun, sky };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const rt = reviewTime(t, ctx);
  const v = { ...VIEWS[0], ...VIEWS[Math.min(VIEWS.length - 1, Math.max(0, rt.k))] };
  S.P.update(T_POSE);
  const r = S.P.rootAt(T_POSE);
  const az = r.yaw + (v.az * Math.PI) / 180;
  camera.position.set(r.x + v.dist * Math.sin(az), v.h, r.z + v.dist * Math.cos(az));
  camera.lookAt(r.x + 0.18 * Math.sin(r.yaw), v.aim, r.z + 0.18 * Math.cos(r.yaw));
  camera.fov = v.fov; camera.near = 0.05; camera.far = 300;
  camera.updateProjectionMatrix();
  S.sun.target.position.set(r.x, 0, r.z);
  S.sun.position.copy(S.sky.sun.direction).multiplyScalar(40).add(S.sun.target.position);
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 8; ctx.lens.focus = v.dist; ctx.lens.shutterAngle = 90; }
}
