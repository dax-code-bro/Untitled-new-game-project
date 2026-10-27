// Humans performance - body pose development: one character posed by the performer API at a fixed
// time, seen from several views (frame k = view k), for iterating on gestures / postures quickly.
// scenes/lookdev/humans-anim-pose.json:
//   { "id": "abby", "t": 2.0, "arms": "auto",
//     "acts": [["gesture", "cradle", -5, { "side": "L", "dur": 99 }], ["posture", "hunch", -5, { "hold": 99 }],
//              ["walkPath", [[0, -2], [0, 2]], 0.5, { "speed": 0.8 }], ["mood", { "pain": 0.4 }]],
//     "views": [{ "az": 0, "dist": 2.2, "h": 1.1, "fov": 28, "aim": 1.0 }, { "az": 45 }, { "az": 90 }] }
// az: degrees round the character from its front; dist / h / aim (height looked at) in metres.
//   node render/render.mjs scenes/lookdev/humans-anim-pose.js --preset preview --fps 1 --seconds N --workers 1
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { groundMaterial, reviewTime } from '../lib/humans/stage.js';
import { createPerformer, loadPerformanceData } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

const CFG = await fetch(new URL('./humans-anim-pose.json', import.meta.url)).then((r) => r.json()).catch(() => ({ id: 'abby', views: [{}] }));

export const meta = {
  title: 'Humans performance - pose dev',
  duration: Math.max(1, (CFG.views || [{}]).length),
  seed: 6,
  cinematic: filmFinish({ motionBlur: { mode: 'off' }, shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { samples: 24 }, grade: { exposure: 0.1, whiteBalance: 6000 } }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: CFG.hdriRot ?? 0.9 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 100 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), await groundMaterial('pbr/acg_ground03', ctx, [120, 120]));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const data = await loadPerformanceData();
  const ch = await loadCharacter(CFG.id || 'abby');
  scene.add(ch.root);
  const P = createPerformer(ch, data, { arms: CFG.arms || 'auto' }).place(0, 0, 0);
  for (const [fn, ...args] of CFG.acts || []) P[fn](...args);
  S = { ch, P, sun, sky };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const rt = reviewTime(t, ctx);
  const views = CFG.views || [{}];
  const v = { az: 0, dist: 2.4, h: 1.1, fov: 28, aim: 1.0, ...views[0], ...views[Math.min(views.length - 1, Math.max(0, rt.k))] };
  const tp = (v.t ?? CFG.t ?? 1) + (rt.lt - Math.floor(rt.lt) - 0.5) * 0.04;
  S.P.update(tp);
  const r = S.P.rootAt(tp);
  const az = r.yaw + (v.az * Math.PI) / 180;
  camera.position.set(r.x + v.dist * Math.sin(az), v.h, r.z + v.dist * Math.cos(az));
  camera.lookAt(r.x, v.aim, r.z);
  camera.fov = v.fov; camera.near = 0.05; camera.far = 300;
  camera.updateProjectionMatrix();
  S.sun.target.position.set(r.x, 0, r.z);
  S.sun.position.copy(S.sky.sun.direction).multiplyScalar(40).add(S.sun.target.position);
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 5.6; ctx.lens.focus = v.dist; ctx.lens.shutterAngle = 90; }
}
