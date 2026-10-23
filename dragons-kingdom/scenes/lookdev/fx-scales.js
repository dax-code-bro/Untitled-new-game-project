// FX lookdev - blood on scales (F1 in assets-delta.md): Charcoal after the bite. The spray thrown
// back from his jaws along the side of his neck, the jaws and chin coated and running, the neck
// spattered with drops elongated away from the mouth - decals with thickness on the scaled hide
// (they ride on the skinned mesh), wet, then tacky and dry.
//
// Views (6 s each):
//   0 the head 3/4 front just after the bite (spray in the air, the coat starting to run)
//   1 the side of the neck, the spatter carried back along it (3 s after)
//   2 the head 10 minutes later: the film dried dark and matte, edges first
//
//   node render/render.mjs --still scenes/lookdev/fx-scales.js --time 1.0 --preset draft --png out.png
import * as THREE from 'three';
import { loadHDRI } from '../lib/assets.js';
import { groundMaterial } from '../lib/humans/stage.js';
import { createCreature, poses } from '../lib/creatures/index.js';
import { createFx } from '../lib/fx/index.js';
import { surfaceHit } from '../lib/fx/gore.js';

export const meta = {
  title: 'FX lookdev - blood on Charcoal\'s scales',
  duration: 18,
  seed: 13,
  cinematic: {
    atmosphere: { enabled: true, sky: 'scene', haze: 1.0 },
    ao: { enabled: true, radius: 0.8 },
    dof: { enabled: true },
    grade: { exposure: 0.0, whiteBalance: 5800 },
  },
};

const BITE = 0.3;
let S;
export async function setup(ctx) {
  const { scene } = ctx;
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true });
  const sun = sky.apply(scene);
  sun.castShadow = true; sun.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 220; sc.updateProjectionMatrix();
  sun.position.copy(sky.sun.direction).multiplyScalar(100);
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), await groundMaterial('pbr/ph_sandstone_blocks_04', ctx, [100, 100], { tint: [0.85, 0.83, 0.8] }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const fx = await createFx(ctx, { ground: 0, wind: [0, 0, 0], tier: ctx.meta.fxTier });
  const c = await createCreature('charcoal', { quality: 'standard' });
  c.root.rotation.y = -0.9;
  scene.add(c.root);
  c.setPose(poses.stand(c, { t: 0, look: [0.3, 0.02], blink: false, lidRelax: 0.1 }));
  c.root.updateMatrixWorld(true);
  const body = c.meshes[0];
  const B = (n) => c.bones[c.boneIndex[n]].getWorldPosition(new THREE.Vector3());
  const head = B('head'), jaw = B('jaw'), eL = B('eye_L'), eR = B('eye_R');
  const eyes = eL.clone().lerp(eR, 0.5);
  const fwd = eyes.clone().sub(head).setY(0).normalize();          // the snout's heading
  const left = eL.clone().sub(eR).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const H = c.anatomy.dims.H ?? 3;
  // a point ON the hide: cast at the body from outside along -dir
  const on = (p, dir, back = 4) => { const h = surfaceHit(body, p.clone().addScaledVector(dir, back).toArray(), dir.clone().negate().toArray()); return h ? new THREE.Vector3(...h.point) : p.clone(); };
  const dry = [90, 480];
  // the lower jaw and chin coated: the bite's blood ran out over the lips and down the chin
  const chinP = jaw.clone().addScaledVector(fwd, H * 0.45).addScaledVector(up, -H * 0.12);
  const chinDir = fwd.clone().multiplyScalar(0.45).addScaledVector(up, -0.35).addScaledVector(left, 0.8).normalize();
  fx.blood.coat({ target: body, liquid: 'bloodDark', at: on(chinP, chinDir).toArray(), dir: chinDir.clone().negate().toArray(), up: [0, 1, 0], size: [H * 0.85, H * 0.5, H * 0.6], t0: BITE, grow: [0, 3], params: [0, 7, 0.7, 0.6], amount: 0.75, seed: 3, dry, maxAngle: 88 });
  // the lips and the gape on the near side, heavier
  const gapeP = jaw.clone().addScaledVector(fwd, H * 0.15).addScaledVector(left, H * 0.25);
  fx.blood.coat({ target: body, liquid: 'bloodDark', at: on(gapeP, left).toArray(), dir: left.clone().negate().toArray(), up: [0, 1, 0], size: [H * 0.6, H * 0.28, H * 0.5], t0: BITE, grow: [0, 2], params: [0, 3, 0.9, 0.3], amount: 0.7, seed: 7, dry, maxAngle: 85 });
  // runs down the throat from under the jaw
  const throatP = jaw.clone().addScaledVector(fwd, -H * 0.15).addScaledVector(up, -H * 0.3).addScaledVector(left, H * 0.12);
  const thDir = left.clone().multiplyScalar(0.8).addScaledVector(fwd, 0.4).normalize();
  fx.blood.runs({ target: body, liquid: 'bloodDark', at: on(throatP, thDir).toArray(), dir: thDir.clone().negate().toArray(), up: [0, 1, 0], size: [H * 0.5, H * 0.9, H * 0.6], t0: BITE + 0.5, grow: [0, 6], params: [0, 5, 0, 0], amount: 0.8, seed: 9, dry, maxAngle: 88 });
  // the spray thrown back along the neck: spatter on the side of the neck, drops elongated away
  // from the jaws (uSrc toward the head), densest near the head
  const n7 = B('neck_7'), n3 = B('neck_3');
  const neckP = n7.clone().lerp(n3, 0.4).addScaledVector(left, 0.5);
  const nDir = left.clone();
  const nAt = on(neckP, nDir);
  const along = n7.clone().sub(n3).normalize();
  fx.blood.spatter({ target: body, at: nAt.toArray(), dir: nDir.clone().negate().toArray(), up: along.toArray(), size: [H * 0.9, H * 1.8, H * 0.8], t0: BITE + 0.15, src: [0, H * 0.75], params: [H * 0.45, 0.05, 0.025, 2.2], amount: 0.55, seed: 4, dry, maxAngle: 85 });
  // the spray itself: out of the jaws, back and to the near side, falling over the neck
  const mouth = jaw.clone().addScaledVector(fwd, H * 0.55).addScaledVector(left, H * 0.1);
  const sprayDir = fwd.clone().multiplyScalar(-0.75).addScaledVector(left, 0.45).addScaledVector(up, 0.5).normalize();
  fx.blood.spray({ at: mouth.toArray(), dir: sprayDir.toArray(), t0: BITE, duration: 0.35, speed: 7, spread: 0.35, count: 900, size: 0.004, mistCount: 120, wind: [0, 0, 0] });
  S = { fx, c, head, jaw, fwd, left, up, H, nAt, along };
}

const VIEWS = [
  // the head, 3/4 front, a little below the eye line
  { cam: () => { const p = S.jaw.clone().addScaledVector(S.fwd, S.H * 2.6).addScaledVector(S.left, S.H * 2.4).addScaledVector(S.up, -S.H * 0.1); return [p, S.jaw.clone().addScaledVector(S.fwd, S.H * 0.25)]; }, f: 45, fstop: 5.6, dt: 0 },
  // the side of the neck
  { cam: () => { const p = S.nAt.clone().addScaledVector(S.left, S.H * 2.2).addScaledVector(S.up, S.H * 0.4); return [p, S.nAt]; }, f: 40, fstop: 5.6, dt: 3 },
  // the head again, 10 minutes on
  { cam: () => { const p = S.jaw.clone().addScaledVector(S.fwd, S.H * 2.6).addScaledVector(S.left, S.H * 2.4).addScaledVector(S.up, -S.H * 0.1); return [p, S.jaw.clone().addScaledVector(S.fwd, S.H * 0.25)]; }, f: 45, fstop: 5.6, dt: 600 },
];
export function update(t, ctx) {
  const cam = ctx.camera;
  const view = Math.min(VIEWS.length - 1, Math.floor(t / 6)), tt = t - view * 6;
  const V = VIEWS[view];
  const [p, l] = V.cam();
  cam.position.copy(p); cam.lookAt(l);
  cam.near = 0.1; cam.far = 3000;
  ctx.lens.sensor = 'super35'; ctx.lens.focalLength = V.f; ctx.lens.fstop = V.fstop; ctx.lens.shutterAngle = 180;
  ctx.lens.focus = p.distanceTo(l);
  S.fx.update(tt + V.dt);
}
