// Performance proof 1 - Queen Alexandria whispers the ORIGINAL line L011 "My pretty little weapon"
// to the hatchling (close-up, face readable). Lip-sync from the take's own forced phone alignment
// (scenes/lib/humans/data/lipsync-s01e01.json), coarticulated visemes on the CC0 MakeHuman face
// units, the line's hand-set performance (tender, a cold edge: faceperf.js LINE_OVERRIDES), eyes on
// the hatchling below frame with fixation saccades, blinks, breathing, and a hold after the line.
// The WAV starts at t = 1.0 (scene time = take time + 1.0); the mux for a draft clip:
//   node render/render.mjs scenes/lookdev/humans-anim-alexandria.js --preset draft --audio <L011 padded 1 s>
// Lighting: a warm low practical (the nest lamps) keying from below camera left, a cool high
// daylight from behind (the chamber's window shaft), an interior HDRI for the bounce.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { loadCharacter } from '../lib/humans/index.js';
import { loadPerformanceData, createPerformer } from '../lib/humans/perform.js';
import { filmFinish } from './finish.js';

const LINE = 'L011', T_LINE = 1.0;
export const meta = {
  title: 'Performance - Alexandria L011 close-up',
  duration: 4.5,
  seed: 3,
  cinematic: filmFinish({
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.08 },
    dof: { samples: 48 },
    grade: { exposure: 0.15, whiteBalance: 4300 },
    lensFx: { vignette: 0.9 },
  }),
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/old_room', ctx, { envIntensity: 0.32, backgroundIntensity: 0.05, backgroundBlurriness: 0.6, rotationY: 2.2 });
  sky.apply(scene, { sunLight: false });
  // the chamber: a stone floor and a dark wall well behind her (soft in the lens)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), await loadPBR('pbr/ph_sandstone_blocks_04', ctx, { worldSize: 12 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), await loadPBR('pbr/ph_white_sandstone_bricks_03', ctx, { worldSize: 6 }));
  wall.position.set(0.8, 2.5, -2.4); wall.material.color.multiplyScalar(0.35); wall.receiveShadow = true; scene.add(wall);
  const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), wall.material);
  wall2.position.set(-2.6, 2.5, 1.5); wall2.rotation.y = Math.PI / 2; wall2.receiveShadow = true; scene.add(wall2);
  scene.background = new THREE.Color(0.01, 0.008, 0.006);
  // warm practical: low, camera left, in front of her (the lamps by the nest)
  // (from the side of the nest rather than in front of her: the face models - nose shadow, a darker
  // far cheek - instead of reading flat and pale)
  const key = new THREE.SpotLight(new THREE.Color(1.0, 0.68, 0.4), 7, 7, 0.75, 0.6, 2);
  key.position.set(1.05, 1.0, 0.7); key.target.position.set(0, 1.45, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.004; key.shadow.camera.near = 0.2;
  scene.add(key, key.target);
  // cool daylight shaft from a high opening behind her right shoulder (rim on the veil and cheek)
  const shaft = new THREE.DirectionalLight(new THREE.Color(0.72, 0.84, 1.0), 2.4);
  shaft.position.set(-2.2, 4.2, -2.6); shaft.target.position.set(0, 1.4, 0);
  shaft.castShadow = true; shaft.shadow.mapSize.set(2048, 2048);
  Object.assign(shaft.shadow.camera, { left: -0.8, right: 0.8, top: 2.2, bottom: 0.4, near: 0.5, far: 12 });
  shaft.shadow.bias = -0.0002; shaft.shadow.normalBias = 0.005;
  scene.add(shaft, shaft.target);
  // a faint warm bounce from the nest straw below
  const bounce = new THREE.PointLight(new THREE.Color(1.0, 0.75, 0.5), 0.6, 2.5, 2);
  bounce.position.set(0.1, 0.7, 0.6); scene.add(bounce);

  const data = await loadPerformanceData();
  const ch = await loadCharacter('alexandria');
  scene.add(ch.root);
  const P = createPerformer(ch, data, { arms: 'drape' });
  // she stands bent toward the nest (the build is standing): eyes on the hatchling below frame
  const hatch = new THREE.Vector3(0.25, 1.02, 0.75);
  P.place(0, 0, 0.42);
  P.mood({ tender: 0.25, calm: 0.3 });
  P.lookAt(hatch, -5, { amount: 0.55 });
  P.performLine(LINE, T_LINE);
  // a glance up at nothing after the line (she holds; the thought lands), then back down
  P.glance(new THREE.Vector3(0.6, 1.1, 1.4), T_LINE + 2.15);
  P.glance(hatch, T_LINE + 2.75);
  S = { ch, P };
  // framing from the pose at t = 0 (fixed: every worker / chunk gets the same camera)
  P.update(0);
  ch.root.updateMatrixWorld(true);
  const eL = ch.bone('eye.L').getWorldPosition(new THREE.Vector3()), eR = ch.bone('eye.R').getWorldPosition(new THREE.Vector3());
  const tgt = eL.add(eR).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.035, 0));
  // from low beside the nest (the hatchling's side), looking up into her lowered face: the eyes and
  // mouth read while she looks down at it (a level camera saw the top of her bowed head)
  const az = 0.42 + 0.42, el = -0.24, dist = 0.95;
  const pos = new THREE.Vector3(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
  // focus between the eyes and the mouth (a dialogue close-up reads both; on the eyes alone the lips
  // went soft at f/3.2), stopped down to f/4.5: ~4.5 cm of depth of field at 0.95 m
  const eyes = ch.bone('eye.L').getWorldPosition(new THREE.Vector3()).add(ch.bone('eye.R').getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const mouth = ch.bone('oris01').getWorldPosition(new THREE.Vector3()).add(ch.bone('oris05').getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  S.cam = { pos, tgt, focus: (pos.distanceTo(eyes) + pos.distanceTo(mouth)) / 2 };
}

export function update(t, ctx) {
  const { camera } = ctx;
  S.P.update(t);
  camera.position.copy(S.cam.pos);
  camera.lookAt(S.cam.tgt);
  camera.fov = 21; camera.near = 0.03; camera.far = 60;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 4.5; ctx.lens.focus = S.cam.focus; ctx.lens.shutterAngle = 180; }
}
