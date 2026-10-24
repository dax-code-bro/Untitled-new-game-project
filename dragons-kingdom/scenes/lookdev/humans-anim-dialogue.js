// Performance proof 2 - Remi and Abby exchange lines over the newborn hatchling (scene 1A):
//   L014 ABBY  "It's gold."          (amazed)            WAV at t = 0.80
//   L015 REMI  "I can see that."     (dry big brother)   WAV at t = 1.90
//   L016 ABBY  "I mean all of it."   (correcting him)    WAV at t = 3.27
// Both watch the nest below the lens; Remi turns his eyes to his sister for his dry reply, Abby
// turns up to him to correct him and back to the hatchling. Lip-sync from the takes' phone
// alignment, emotions from the delivery notes (faceperf.js LINE_OVERRIDES for these three),
// blinks, gaze with fixation saccades on the other's face, breathing, weight shift.
// Draft clip with the takes: see the audio mix line in scenes/lib/humans/PROGRESS.md.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { loadPerformanceData, createPerformer } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

export const LINES = [['L014', 'abby', 0.8], ['L015', 'remi', 1.9], ['L016', 'abby', 3.27]];
export const meta = {
  title: 'Performance - Remi and Abby, lines L014-L016',
  duration: 5.6,
  seed: 4,
  cinematic: filmFinish({ shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.1 }, dof: { samples: 48 }, grade: { exposure: 0.4, whiteBalance: 4400 }, lensFx: { vignette: 0.9 } }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/old_room', ctx, { envIntensity: 0.35, backgroundIntensity: 0.05, backgroundBlurriness: 0.6, rotationY: 0.4 });
  sky.apply(scene, { sunLight: false });
  scene.background = new THREE.Color(0.01, 0.008, 0.006);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), await loadPBR('pbr/ph_sandstone_blocks_04', ctx, { worldSize: 14 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wallMat = await loadPBR('pbr/ph_white_sandstone_bricks_03', ctx, { worldSize: 6 });
  wallMat.color.multiplyScalar(0.18);
  for (const [x, z, ry] of [[0, -3.8, 0], [-3.2, 0, Math.PI / 2], [3.2, 0, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wallMat);
    w.position.set(x, 2.5, z); w.rotation.y = ry; w.receiveShadow = true; scene.add(w);
  }
  // the nest lamps: warm, low, in front of them (camera side); a cool daylight shaft from high behind
  const key = new THREE.SpotLight(new THREE.Color(1.0, 0.68, 0.42), 9, 8, 0.8, 0.6, 2);
  key.position.set(-0.9, 0.9, 1.7); key.target.position.set(0, 1.35, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.004; key.shadow.camera.near = 0.2;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(new THREE.Color(1.0, 0.72, 0.48), 1.2, 4, 2);
  fill.position.set(0.9, 0.7, 1.3); scene.add(fill);
  const shaft = new THREE.DirectionalLight(new THREE.Color(0.72, 0.84, 1.0), 2.2);
  shaft.position.set(1.8, 4.5, -2.8); shaft.target.position.set(0, 1.3, 0);
  shaft.castShadow = true; shaft.shadow.mapSize.set(2048, 2048);
  Object.assign(shaft.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: 0.2, near: 0.5, far: 12 });
  shaft.shadow.bias = -0.0002; shaft.shadow.normalBias = 0.005;
  scene.add(shaft, shaft.target);

  const data = await loadPerformanceData();
  const [abbyCh, remiCh] = await Promise.all([loadCharacter('abby'), loadCharacter('remi')]);
  scene.add(abbyCh.root, remiCh.root);
  const nest = new THREE.Vector3(0.15, 0.5, 1.75);
  const abby = createPerformer(abbyCh, data, { arms: 'drape' }).place(-0.28, 0.05, 0.12);
  const remi = createPerformer(remiCh, data, { arms: 'drape' }).place(0.42, -0.3, -0.2);
  // both watch the hatchling; Remi glances at his sister for his reply, she turns up to correct him
  abby.mood({ surprise: 0.25, amusement: 0.1 }).lookAt(nest, -9, { amount: 0.7 });
  remi.mood({ calm: 0.3, amusement: 0.15 }).lookAt(nest, -9, { amount: 0.6 });
  for (const [id, who, t0] of LINES) (who === 'abby' ? abby : remi).performLine(id, t0);
  remi.lookAt({ ch: abbyCh }, 1.65, { amount: 0.55 });
  remi.lookAt(nest, 3.9, { amount: 0.6 });
  abby.lookAt({ ch: remiCh }, 3.05, { amount: 0.75 });
  abby.lookAt(nest, 4.55, { amount: 0.7 });
  remi.glance({ ch: abbyCh }, 3.4);
  S = { abby, remi, abbyCh, remiCh };
  // camera: a medium two-shot from beside the nest, a touch below their eyes, fixed
  abby.update(0); remi.update(0);
  const hA = abbyCh.bone('head').getWorldPosition(new THREE.Vector3()), hR = remiCh.bone('head').getWorldPosition(new THREE.Vector3());
  const mid = hA.clone().lerp(hR, 0.5).add(new THREE.Vector3(0, -0.02, 0));
  S.cam = { pos: new THREE.Vector3(0.3, mid.y - 0.1, 2.5), tgt: mid.clone().add(new THREE.Vector3(0.02, -0.1, 0)) };
  S.cam.focus = S.cam.pos.distanceTo(hA);
}

export function update(t, ctx) {
  const { camera } = ctx;
  S.abby.update(t);
  S.remi.update(t);
  camera.position.copy(S.cam.pos);
  camera.lookAt(S.cam.tgt);
  camera.fov = 19; camera.near = 0.05; camera.far = 60;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 2.8; ctx.lens.focus = S.cam.focus; ctx.lens.shutterAngle = 180; }
}
