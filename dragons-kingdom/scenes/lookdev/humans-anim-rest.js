// Humans performance - a soft hand resting on a body (rig.js restHand / the 'rest' hand shape; director
// session 26 REQUEST for F4: Alexandria's hand on the newborn hatchling read as a claw - the build's
// fanned drape fingers). Alexandria stands at a rounded "flank" (a lying capsule, the hatchling stand-in)
// at hip height: her right hand palm DOWN on its top, her left hand palm UP under its near underside.
// frame 0: restHand (after), frame 1: same arms with the build's drape fingers (before), frame 2: after
// from her right side, low.
//   node render/render.mjs --still scenes/lookdev/humans-anim-rest.js --time 0.5 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { restHand } from '../lib/humans/rig.js';
import { filmFinish } from './finish.js';

export const meta = {
  title: 'Humans performance - resting hand',
  duration: 3,
  seed: 4,
  cinematic: filmFinish({ motionBlur: { mode: 'off' }, shadows: { cascades: 0 }, ao: { enabled: true, radius: 0.06 }, dof: { samples: 16 }, grade: { exposure: 0.15, whiteBalance: 4600 } }),
};

// the flank: a capsule lying across in front of her (axis X), radius R, centre C
const R = 0.11, C = new THREE.Vector3(0, 0.86, 0.42);
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/old_room', ctx, { envIntensity: 0.5, backgroundIntensity: 0.05, backgroundBlurriness: 0.6, rotationY: 2.2 });
  sky.apply(scene, { sunLight: false });
  scene.background = new THREE.Color(0.02, 0.016, 0.012);
  const key = new THREE.SpotLight(new THREE.Color(1.0, 0.75, 0.5), 9, 8, 0.8, 0.6, 2);
  key.position.set(-1.0, 1.9, 1.6); key.target.position.copy(C);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.004; key.shadow.camera.near = 0.2;
  scene.add(key, key.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const flank = new THREE.Mesh(new THREE.CapsuleGeometry(R, 0.5, 8, 32), new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.6 }));
  flank.rotation.z = Math.PI / 2; flank.position.copy(C); flank.castShadow = flank.receiveShadow = true; scene.add(flank);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, C.y - R, 0.16), floor.material);
  stand.position.set(C.x, (C.y - R) / 2, C.z); scene.add(stand);
  const ch = await loadCharacter('alexandria');
  scene.add(ch.root);
  S = { ch };
}

function pose(t, after) {
  const { ch } = S;
  ch.update(t);
  placeCharacter(ch, 0, 0, 0, 0);
  ch.update(t);
  // right hand (her right = -X): palm down on top of the flank, a little toward her
  const nR = new THREE.Vector3(0, 0.95, -0.3).normalize();
  const atR = C.clone().add(new THREE.Vector3(-0.1, 0, 0)).addScaledVector(nR, R);
  // left hand (+X): palm UP under the near underside (the surface above the palm faces down / toward her)
  const nL = new THREE.Vector3(0, -0.8, -0.6).normalize();
  const atL = C.clone().add(new THREE.Vector3(0.12, 0, 0)).addScaledVector(nL, R);
  const poleR = new THREE.Vector3(-0.45, 0.9, 0.0), poleL = new THREE.Vector3(0.45, 0.8, 0.0);
  const fR = new THREE.Vector3(0.35, 0, 1), fL = new THREE.Vector3(-0.2, 0, 1);
  restHand(ch, 'R', { at: atR, normal: nR, fingers: fR, pole: poleR, radius: R });
  restHand(ch, 'L', { at: atL, normal: nL, fingers: fL, pole: poleL, radius: R });
  if (!after) {
    // the build's drape fingers (what the scene shows with keepFingers)
    for (const sd of ['L', 'R']) for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) {
      const n = `finger${f}-${j}.${sd}`, b = ch.bone(n);
      if (b) b.quaternion.copy(ch.drape.q[ch.index[n]]);
    }
    for (const sd of ['L', 'R']) for (let k = 1; k <= 4; k++) { const n = `metacarpal${k}.${sd}`, b = ch.bone(n); if (b) b.quaternion.copy(ch.drape.q[ch.index[n]]); }
    ch.root.updateMatrixWorld(true);
  }
}

export function update(t, ctx) {
  const { camera } = ctx;
  const k = Math.min(2, Math.floor(t));
  pose(1.0, k !== 1);
  if (k < 2) camera.position.set(0.25, 1.45, 1.25);
  else camera.position.set(-0.75, 1.02, 0.85);
  camera.lookAt(C.x, C.y + 0.02, C.z - 0.06);
  camera.fov = 24; camera.near = 0.05; camera.far = 50;
  camera.updateProjectionMatrix();
  if (ctx.lens) { ctx.lens.focalLength = null; ctx.lens.fstop = 8; ctx.lens.focus = camera.position.distanceTo(C); ctx.lens.shutterAngle = 90; }
}
