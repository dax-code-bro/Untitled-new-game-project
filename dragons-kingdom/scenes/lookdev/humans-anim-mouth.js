// Humans performance - MOUTH MACRO: one character speaking one take, the camera on the mouth (lips,
// teeth, tongue, the inside of the lips), frame k = moment k of the take. For checking the mouth
// interior shading and the lip-sync shapes up close (the close-ups of Episode 1 hold the mouth at
// 1/6 of the frame height). Same light rig as humans-anim-alexandria.js (warm low key camera left,
// cool high shaft from behind, interior HDRI); each light can be switched off from the JSON.
// scenes/lookdev/humans-anim-mouth.json:
//   { "id": "alexandria", "line": "L011", "times": [0.33, 0.55, ...]  (take seconds),
//     "az": 0.84, "el": -0.2, "dist": 0.42, "fov": 21, "lights": { "key": 1, "shaft": 1, "bounce": 1, "env": 0.32 } }
// Render all moments as a 1-fps sequence (frame k = moment k, posed at its own time):
//   node render/render.mjs scenes/lookdev/humans-anim-mouth.js --preset draft --fps 1 --seconds N --workers 1
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { loadPerformanceData, createPerformer } from '../lib/humans/perform.js';
import { reviewTime } from '../lib/humans/stage.js';
import { filmFinish } from './finish.js';

const CFG = await fetch(new URL('./humans-anim-mouth.json', import.meta.url)).then((r) => r.json()).catch(() => ({}));
const TIMES = CFG.times || [0.3, 0.6, 0.9, 1.2];
const L = { key: 1, shaft: 1, bounce: 1, env: 0.32, ...(CFG.lights || {}) };

export const meta = {
  title: 'Humans performance - mouth macro',
  duration: TIMES.length,
  seed: 3,
  cinematic: filmFinish({
    motionBlur: { mode: 'off' },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.05 },
    dof: { samples: 32 },
    grade: { exposure: CFG.exposure ?? 0.15, whiteBalance: 4300 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/old_room', ctx, { envIntensity: L.env, backgroundIntensity: 0.05, backgroundBlurriness: 0.6, rotationY: 2.2 });
  sky.apply(scene, { sunLight: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), await loadPBR('pbr/ph_sandstone_blocks_04', ctx, { worldSize: 12 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  scene.background = new THREE.Color(0.01, 0.008, 0.006);
  if (L.key) {
    const key = new THREE.SpotLight(new THREE.Color(1.0, 0.68, 0.4), 7 * L.key, 7, 0.75, 0.6, 2);
    key.position.set(1.05, 1.0, 0.7); key.target.position.set(0, 1.45, 0);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.004; key.shadow.camera.near = 0.2;
    scene.add(key, key.target);
  }
  if (L.shaft) {
    const shaft = new THREE.DirectionalLight(new THREE.Color(0.72, 0.84, 1.0), 2.4 * L.shaft);
    shaft.position.set(-2.2, 4.2, -2.6); shaft.target.position.set(0, 1.4, 0);
    shaft.castShadow = true; shaft.shadow.mapSize.set(2048, 2048);
    Object.assign(shaft.shadow.camera, { left: -0.8, right: 0.8, top: 2.2, bottom: 0.4, near: 0.5, far: 12 });
    shaft.shadow.bias = -0.0002; shaft.shadow.normalBias = 0.005;
    scene.add(shaft, shaft.target);
  }
  if (L.bounce) {
    const bounce = new THREE.PointLight(new THREE.Color(1.0, 0.75, 0.5), 0.6 * L.bounce, 2.5, 2);
    bounce.position.set(0.1, 0.7, 0.6); scene.add(bounce);
  }
  const data = await loadPerformanceData();
  const ch = await loadCharacter(CFG.id || 'alexandria');
  scene.add(ch.root);
  const P = createPerformer(ch, data, { arms: 'drape' });
  P.place(0, 0, CFG.yaw ?? 0.42);
  P.lookAt(new THREE.Vector3(0.25, 1.02, 0.75), -5, { amount: 0.55 });
  P.performLine(CFG.line || 'L011', 0, CFG.amp ? { amp: CFG.amp } : {});
  S = { ch, P };
}

export function update(t, ctx) {
  const { camera } = ctx;
  const rt = reviewTime(t, ctx);
  const k = Math.min(TIMES.length - 1, Math.max(0, rt.k));
  // (the first frame of a run cannot know the frame rate: reviewTime gives lt = 0 there - clamp the
  // sub-frame offset so every frame poses at its own moment)
  const tt = TIMES[k] + Math.max(-0.02, Math.min(0.02, rt.lt - k - 0.5));
  S.P.update(tt, { blink: false });
  const ch = S.ch;
  ch.root.updateMatrixWorld(true);
  // aim at the mouth (oris bones), from the side / height the JSON gives (relative to her facing)
  const m = ch.bone('oris01') ? ch.bone('oris01').getWorldPosition(new THREE.Vector3()) : ch.bone('head').getWorldPosition(new THREE.Vector3());
  const eL = ch.bone('eye.L').getWorldPosition(new THREE.Vector3()), eR = ch.bone('eye.R').getWorldPosition(new THREE.Vector3());
  const tgt = m.clone().lerp(eL.add(eR).multiplyScalar(0.5), CFG.up ?? 0.15);
  const yaw = ch.root.rotation.y;
  const az = (CFG.az ?? 0.42) + yaw, el = CFG.el ?? -0.2, dist = CFG.dist ?? 0.42;
  camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
  camera.lookAt(tgt);
  camera.fov = CFG.fov ?? 21; camera.near = 0.02; camera.far = 60;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 5.6; ctx.lens.focus = dist; ctx.lens.shutterAngle = 45; }
}
