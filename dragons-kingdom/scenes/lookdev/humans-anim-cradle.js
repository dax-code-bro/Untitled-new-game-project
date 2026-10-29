// Performance proof 3 - Abby cradles her injured LEFT arm (2A, after the landing): she walks in
// slowly across the riding ground, the left forearm held across her stomach by her right hand
// (motion.js 'cradle': the hurt shoulder drawn up and in, a tremble), wincing on some steps; Remi
// walks at her left side, his right hand holding her left upper arm from outside ('support', on Abby's
// own bones), eyes on her. She stops and says L091 "I'm standing." (WAV at t = 6.3), a little proud, a little shaky.
// The standing 'abby' build is used (any build can cradle; abby_injured has it in its drape pose).
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createPerformer, loadPerformanceData, updateAll } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

export const LINES = [['L091', 'abby', 6.3]];
export const meta = {
  title: 'Performance - Abby cradles her left arm',
  duration: 8.5,
  seed: 21,
  cinematic: filmFinish({ shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.15 }, dof: { samples: 40 }, grade: { exposure: 0.1, whiteBalance: 6100 } }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: 0.9 });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.006;
  sun.target.position.set(0, 0, -1); sun.position.copy(sky.sun.direction).multiplyScalar(40).add(sun.target.position);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 100 });
  scene.add(sun, sun.target);
  const GW = 200, GH = 200;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), await groundMaterial('pbr/acg_ground03', ctx, [GW, GH]));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const data = await loadPerformanceData();
  const [abbyCh, remiCh] = await Promise.all([loadCharacter('abby'), loadCharacter('remi')]);
  scene.add(abbyCh.root, remiCh.root);
  const abby = createPerformer(abbyCh, data, { arms: 'auto' }).place(0, -4.2, 0);
  const remi = createPerformer(remiCh, data, { arms: 'auto' }).place(0.5, -4.38, 0);
  const wa = abby.walkPath([[0, -4.2], [0.05, -2], [0, 0.4]], 0.4, { speed: 0.72, accel: 1.4, decel: 1.6 });
  remi.walkPath([[0.5, -4.38], [0.54, -2.15], [0.5, 0.25]], 0.45, { speed: 0.72, accel: 1.4, decel: 1.6, endYaw: -0.6 });
  // the cradle all the way; a wince on some steps; pain + worry; a hunch in the shoulders
  abby.gesture('cradle', -5, { side: 'L', in: 0.1, dur: 99 });
  abby.posture('hunch', -5, { in: 0.1, hold: 99 });
  abby.mood({ pain: 0.42, worry: 0.25 });
  for (const tw of [1.7, 3.5, 5.2]) abby.react('wince', tw, 0.7);
  abby.lookAt(null, -5);
  abby.lookAt([0, 1.0, 6], wa.t1 - 0.3, { amount: 0.5 });
  abby.performLine('L091', LINES[0][2]);
  abby.lookAt({ ch: remiCh }, LINES[0][2] + 0.95, { amount: 0.7 });
  // Remi: his right hand holds her left upper arm from the outside, above the hurt forearm -
  // steadying her without touching the break (a hand 'under the elbow' ended up at her belly once the
  // cradled elbow sat against her side); eyes on her
  // (motion.js support grip: the palm ON the outside of her sleeve - limbRadius - fingers round the
  // front of her arm; a target on her upper-arm bone put his fingers inside her sleeve)
  remi.gesture('support', 0.2, { side: 'R', grip: { ch: abbyCh, from: 'upperarm01.L', to: 'lowerarm01.L', t: 0.55, dir: [1, 0.05, -0.35], fingers: [-0.15, -0.35, 1] }, in: 0.8, dur: 99, shape: 'clutch' });
  remi.mood({ worry: 0.45 });
  remi.lookAt({ ch: abbyCh }, -5, { amount: 0.7 });
  S = { abby, remi, sun };
}

export function update(t, ctx) {
  const { camera } = ctx;
  updateAll([S.abby, S.remi], t);      // any order poses the same frame (Remi's hand reads her arm at t)
  // a slow track back in front of them, eye level with Abby
  const r = S.abby.rootAt(Math.min(t, 7.5));
  // (framed to keep Remi's head in: at fov 21 aimed at 1.12 m his crown was cut by the top edge)
  camera.position.set(r.x - 0.6, 1.3, r.z + 3.1);
  camera.lookAt(r.x + 0.24, 1.18, r.z);
  camera.fov = 24; camera.near = 0.1; camera.far = 400;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 2.8; ctx.lens.focus = 3.15; ctx.lens.shutterAngle = 180; }
}
