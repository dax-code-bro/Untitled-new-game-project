// FX lookdev - gore (F2 / F3 in assets-delta.md), each in one brief, readable view the way the
// shot list asks ("one brief close shot, in motion, part of it in shadow"):
//   0 the scout's torn LEFT wing root (1F-20b): hide flaps, exposed muscle, broken bone ends,
//     membrane strips flapping, blood running back over the flank and spraying off it
//   1 the injured villager (R17): split scalp with blood down one side of the face
//   2 his RIGHT leg below the knee: the open fracture through the torn, soaked hose
//   3 the scout's rider after the flames (1F-14b): the sleeve burned away, the forearm burned
// The creature and people are the libraries' current provisional builds; poses are plain (the
// staging belongs to the shots). Grey card behind for value reference.
//
//   node render/render.mjs --still scenes/lookdev/fx-gore.js --time 1.5 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { loadCharacter, placeCharacter } from '../lib/humans/index.js';
import { createCreature, poses } from '../lib/creatures/index.js';
import { createFx } from '../lib/fx/index.js';

export const meta = {
  title: 'FX lookdev - gore',
  duration: 24,
  seed: 11,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    ao: { enabled: true, radius: 0.5 },
    dof: { enabled: true },
    grade: { exposure: 0.0, whiteBalance: 5800 },
  },
};

let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  const rot = Math.atan2(sky.sun.direction.z, sky.sun.direction.x) - 2.4;
  scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
  sky.sun.direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  sun.position.copy(sky.sun.direction).multiplyScalar(60);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), await groundMaterial('pbr/ph_sandstone_blocks_04', ctx, [60, 60], { tint: [0.85, 0.83, 0.8] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const fx = await createFx(ctx, { ground: 0, wind: [0.3, 0, 0.1], tier: ctx.meta.fxTier });
  // the scout, gliding pose, 2 m up at x = -6; its LEFT wing taken off (as after the tear)
  const scout = await createCreature('scout', { quality: 'standard' });
  scout.root.position.set(-6, 2.2, 0);
  scene.add(scout.root);
  scout.setPose(poses.glide(scout, { t: 0 }));
  scout.root.updateMatrixWorld(true);
  for (const m of scout.detachable.meshes) m.visible = false;
  // (the creature library's own wound term stays off: the appliance + decals replace it)
  scout.materials.setPoseUniforms({ wound: { center: scout.restPos[scout.detachable.rootBone.name], radius: scout.anatomy.dims.rA[0] * 1.3, amount: 0 }, tear: 1 });
  const wr = fx.gore.wingRoot({ creature: scout, side: 'L', t0: 0, bleedTime: 6, back: [0, -0.3, 1] });
  const woundP = wr.root.getWorldPosition(new THREE.Vector3());
  const woundN = new THREE.Vector3(0, 0, 1).applyQuaternion(wr.root.getWorldQuaternion(new THREE.Quaternion()));
  // the villager: scalp + open fracture
  const vil = await loadCharacter('villager_hurt');
  placeCharacter(vil, 3, 0, 0, -0.4); scene.add(vil.root); vil.update(0); vil.root.updateMatrixWorld(true);
  fx.gore.scalp({ character: vil, side: 'R', t0: 0 });
  fx.gore.openFracture({ character: vil, side: 'R', t0: 0 });
  // the rider after the flames
  const rider = await loadCharacter('scout_ride');
  placeCharacter(rider, 9, 1.0, 0, -0.6); scene.add(rider.root); rider.update(0); rider.root.updateMatrixWorld(true);
  fx.gore.burnedRider({ character: rider, side: 'R', t0: 0, burnTime: 0.8 });
  const P = (ch, b) => ch.bone(b).getWorldPosition(new THREE.Vector3());
  const vq = vil.root.getWorldQuaternion(new THREE.Quaternion());
  const vFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(vq), vRight = new THREE.Vector3(-1, 0, 0).applyQuaternion(vq);
  const rq = rider.root.getWorldQuaternion(new THREE.Quaternion());
  const rFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq), rRight = new THREE.Vector3(-1, 0, 0).applyQuaternion(rq);
  const rArm = P(rider, 'lowerarm02.R').lerp(P(rider, 'lowerarm01.R'), 0.5);
  S = { fx, scout, vil, rider, woundP, woundN, vHead: P(vil, 'head'), vFwd, vRight, vShin: P(vil, 'lowerleg02.R'), rArm, rNeck: P(rider, 'neck02'), rFwd, rRight };
}

const VIEWS = [
  { look: () => S.woundP, pos: () => S.woundP.clone().addScaledVector(S.woundN, 2.2).add(new THREE.Vector3(0, 0.7, 1.0)), f: 50, fstop: 4 },
  { look: () => S.vHead.clone().addScaledVector(S.vFwd, 0.05), pos: () => S.vHead.clone().addScaledVector(S.vFwd, 0.7).addScaledVector(S.vRight, 0.4).add(new THREE.Vector3(0, 0.04, 0)), f: 65, fstop: 4 },
  { look: () => S.vShin, pos: () => S.vShin.clone().add(new THREE.Vector3(-0.2, 0.25, 0.9)), f: 50, fstop: 4 },
  { look: () => S.rArm, pos: () => S.rArm.clone().addScaledVector(S.rFwd, 0.55).addScaledVector(S.rRight, 0.45).add(new THREE.Vector3(0, 0.22, 0)), f: 45, fstop: 5.6 },
];
export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(VIEWS.length - 1, Math.floor(t / 6)), tt = t - view * 6;
  const V = VIEWS[view];
  const L = V.look();
  cam.position.copy(V.pos()); cam.lookAt(L);
  cam.near = 0.03; cam.far = 2000;
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = V.f; ctx.lens.fstop = V.fstop; ctx.lens.shutterAngle = 180;
  ctx.lens.focus = cam.position.distanceTo(L);
  S.vil.update(0); S.rider.update(0);
  S.fx.update(tt + 3);
}
